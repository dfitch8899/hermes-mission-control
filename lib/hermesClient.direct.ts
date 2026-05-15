/**
 * Direct-HTTP transport for the Hermes command client.
 *
 * Calls the Hermes dashboard REST API (localhost:9119 in the same ECS container)
 * and the kanban plugin API directly, bypassing the Slack relay.
 *
 * Auth: The kanban plugin routes (/api/plugins/*) are unauthenticated by design.
 * The model API (/api/model/*) requires the dashboard session token; calls that
 * fail with 401 propagate as "not configured" so hermesClient.ts falls back to
 * the Slack transport automatically.
 */

import type {
  HermesTransport,
  ChatSendOptions,
  KanbanCreateInput,
  KanbanPlainStatus,
} from './hermesClient.types'
import {
  getHermesDashboardUrl,
  invalidateHermesEndpointCache,
  shouldInvalidateEndpoint,
  warmHermesEndpoint,
} from './hermesEndpoint'

// Per-request env read — was previously a module-level const. The cache hit
// on a cold Vercel Lambda was racing with HERMES_SECRET_KEY being injected
// into process.env, so a few early requests fired with an empty key and got
// 401 back from mc_proxy. Reading at request time eliminates that window.
function authHeaders(): HeadersInit {
  const key = process.env.HERMES_SECRET_KEY
  return key ? { 'X-Hermes-Key': key } : {}
}

// Fire-and-forget warmup at module load — any import of this client kicks
// the ECS endpoint discovery so the first /api/hermes/* request after a
// cold start doesn't pay the 1.5 s round-trip in its critical path. The
// page-level layout already warms on render, but pure-API requests (cron
// sync, webhook handlers, etc.) bypass that path and rely on this.
warmHermesEndpoint()

/** Resolves the base URL. Throws on discovery failure so callers can handle it. */
async function dashboardUrl(): Promise<string> {
  return getHermesDashboardUrl()
}

/**
 * Single error-handling gateway for every direct-transport HTTP response.
 *
 *  - 5xx / network: invalidate endpoint cache so next call re-discovers
 *    after an ECS task replace; throw "not configured" so chatSend can
 *    fall back to Slack on a draining task.
 *  - 401 / 403: throw "not configured" (fallback trigger).
 *  - Other non-2xx: throw a descriptive error with the truncated body.
 */
async function checkResponse(res: Response, context: string): Promise<void> {
  if (res.ok) return
  if (shouldInvalidateEndpoint({ status: res.status })) {
    invalidateHermesEndpointCache()
    throw new Error(`not configured: dashboard ${res.status} (cache invalidated) for ${context}`)
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`not configured: dashboard auth required for ${context}`)
  }
  const body = await res.text().catch(() => '')
  throw new Error(`${context} failed: HTTP ${res.status} — ${body.slice(0, 200)}`)
}

export const directTransport: HermesTransport = {
  async chatSend(opts: ChatSendOptions): Promise<string | null> {
    const base = await dashboardUrl()

    const res = await fetch(`${base}/api/mc/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ text: opts.text }),
      signal:  AbortSignal.timeout(120_000),
    })

    // Use the shared gateway so 401/403/5xx all produce the "not configured"
    // sentinel that chatWithFallback() in hermesClient.ts checks for. Previously
    // a 401 here threw "chatSend failed: HTTP 401 …" which didn't match the
    // fallback substrings — the user got an error instead of Slack relay.
    await checkResponse(res, 'chatSend')

    if (!res.body) throw new Error('chatSend: no response body')

    // Parse OpenAI SSE stream:
    //   data: {"choices":[{"delta":{"content":"..."}}]}
    //   data: [DONE]
    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let accumulated = ''
    let buf         = ''
    let streamDone  = false

    try {
      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        // Process complete SSE lines
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''   // last partial line stays in buffer

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') {
            // Stop reading: some upstream proxies keep the connection open
            // briefly after [DONE], which previously left the outer while(true)
            // accumulating bytes until close. Hoisting the flag exits both
            // loops cleanly.
            streamDone = true
            break
          }

          try {
            const chunk = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string; role?: string } }>
            }
            const delta = chunk.choices?.[0]?.delta?.content
            if (delta) {
              accumulated += delta
              opts.onTextUpdate(accumulated)
            }
          } catch { /* skip malformed chunks */ }
        }
      }
    } finally {
      reader.releaseLock()
    }

    return accumulated || null
  },

  async kanbanCreate(input: KanbanCreateInput): Promise<string> {
    const base = await dashboardUrl()
    // Hermes plugin uses `?board=` as a query param, not a body field.
    const qs = input.board ? `?board=${encodeURIComponent(input.board)}` : ''
    // Map MC's string priority to the plugin's int priority. The plugin's
    // CreateTaskBody declares `priority: int = 0`; conventional mapping
    // surfaces user intent without inventing a separate scale on each side.
    const priorityInt =
      input.priority === 'critical' ? 2 :
      input.priority === 'high'     ? 1 :
      input.priority === 'low'      ? -1 :
                                       0
    const body: Record<string, unknown> = {
      title:          input.title,
      body:           input.description ?? '',
      priority:       priorityInt,
      workspace_kind: input.workspaceType ?? 'scratch',
      // Land the task in the triage column by default — every MC-side
      // create path (NewTaskModal, terminal) historically defaulted there.
      triage:         input.triage ?? true,
    }
    if (input.assignee) body.assignee = input.assignee
    if (input.tenant)   body.tenant   = input.tenant

    const res = await fetch(`${base}/api/plugins/kanban/tasks${qs}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    })
    await checkResponse(res, 'kanbanCreate')

    const data = await res.json() as { task?: { id?: string } }
    const id = data.task?.id
    if (!id) throw new Error('kanbanCreate: response missing task.id')
    return id
  },

  async kanbanSetStatus(taskId: string, status: KanbanPlainStatus, board?: string) {
    const base = await dashboardUrl()
    const qs = board ? `?board=${encodeURIComponent(board)}` : ''
    const res = await fetch(`${base}/api/plugins/kanban/tasks/${taskId}${qs}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ status }),
    })
    await checkResponse(res, `kanbanSetStatus(${taskId}, ${status})`)
  },

  async kanbanComplete(taskId, result, _senderName) {
    const base = await dashboardUrl()
    const body: Record<string, unknown> = { status: 'done' }
    if (result) body.result = result
    const res = await fetch(`${base}/api/plugins/kanban/tasks/${taskId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    })
    await checkResponse(res, `kanbanComplete(${taskId})`)
  },

  async kanbanBlock(taskId, reason, _senderName) {
    const base = await dashboardUrl()
    // Dashboard API uses block_reason (not reason) per plugin_api.py UpdateTaskBody
    const body: Record<string, unknown> = { status: 'blocked' }
    if (reason) body.block_reason = reason
    const res = await fetch(`${base}/api/plugins/kanban/tasks/${taskId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    })
    await checkResponse(res, `kanbanBlock(${taskId})`)
  },

  async kanbanComment(taskId, text, _senderName) {
    const base = await dashboardUrl()
    // Plugin API expects { body: string } per CommentBody model
    const res = await fetch(`${base}/api/plugins/kanban/tasks/${taskId}/comments`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ body: text }),
    })
    await checkResponse(res, `kanbanComment(${taskId})`)
  },

  async modelSet(model) {
    // Defense-in-depth: mc_proxy whitespace-splits and doesn't shell-eval,
    // so `model=foo; rm -rf /` becomes a literal argv token rather than a
    // separator — but that's a property of an external service. Enforce the
    // model name shape locally so this layer doesn't depend on it.
    if (!/^[A-Za-z0-9._:\-/]+$/.test(model)) {
      throw new Error(`modelSet: invalid model name shape "${model}"`)
    }
    // `hermes config set model.default <name>` writes directly to
    // /opt/data/config.yaml.  The api_server reads that file on every fresh
    // agent instantiation, so the change takes effect on the next chat request.
    const base = await dashboardUrl()
    const res = await fetch(`${base}/api/mc/exec`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ command: `config set model.default ${model}` }),
      signal:  AbortSignal.timeout(15_000),
    })
    await checkResponse(res, `modelSet(${model})`)
    const data = await res.json() as { output?: string; exit_code?: number; error?: string }
    if (data.error) throw new Error(`modelSet: ${data.error}`)
    if (data.exit_code !== 0) {
      throw new Error(`modelSet(${model}): exit ${data.exit_code}: ${(data.output ?? '').slice(0, 200)}`)
    }
  },

  async exec(command, _senderName) {
    const base = await dashboardUrl()
    const res = await fetch(`${base}/api/mc/exec`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ command }),
      signal:  AbortSignal.timeout(35_000),
    })
    await checkResponse(res, 'exec')
    const data = await res.json() as { output?: string; exit_code?: number; error?: string }
    if (data.error) throw new Error(`exec: ${data.error}`)
    return data.output ?? ''
  },
}
