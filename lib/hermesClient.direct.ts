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

import type { HermesTransport, ChatSendOptions } from './hermesClient.types'
import { getHermesDashboardUrl, invalidateHermesEndpointCache } from './hermesEndpoint'

// Static key for request auth (same key the proxy checks on every connection).
const HERMES_KEY = process.env.HERMES_SECRET_KEY

function authHeaders(): HeadersInit {
  return HERMES_KEY ? { 'X-Hermes-Key': HERMES_KEY } : {}
}

/** Resolves the base URL. Throws on discovery failure so callers can handle it. */
async function dashboardUrl(): Promise<string> {
  return getHermesDashboardUrl()
}

/** Throws "not configured" (fallback trigger) for auth/network errors.
 *  Throws descriptive error for genuine API failures. */
async function checkResponse(res: Response, context: string): Promise<void> {
  if (res.ok) return
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

    if (!res.ok) {
      if (res.status === 502) invalidateHermesEndpointCache()
      const body = await res.text().catch(() => '')
      throw new Error(`chatSend failed: HTTP ${res.status} — ${body.slice(0, 200)}`)
    }

    if (!res.body) throw new Error('chatSend: no response body')

    // Parse OpenAI SSE stream:
    //   data: {"choices":[{"delta":{"content":"..."}}]}
    //   data: [DONE]
    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let accumulated = ''
    let buf         = ''

    try {
      while (true) {
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
          if (payload === '[DONE]') break

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

  async kanbanComplete(taskId, result, _senderName) {
    const base = await dashboardUrl()
    const body: Record<string, unknown> = { status: 'done' }
    if (result) body.result = result
    const res = await fetch(`${base}/api/plugins/kanban/tasks/${taskId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    })
    if (!res.ok && (res.status === 502 || res.status === 0)) invalidateHermesEndpointCache()
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
    if (!res.ok && (res.status === 502 || res.status === 0)) invalidateHermesEndpointCache()
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
    if (!res.ok && (res.status === 502 || res.status === 0)) invalidateHermesEndpointCache()
    await checkResponse(res, `kanbanComment(${taskId})`)
  },

  async modelSet(model) {
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
    if (!res.ok && (res.status === 502 || res.status === 0)) invalidateHermesEndpointCache()
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`modelSet failed: HTTP ${res.status} — ${body.slice(0, 200)}`)
    }
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
    if (!res.ok && (res.status === 502 || res.status === 0)) invalidateHermesEndpointCache()
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`exec failed: HTTP ${res.status} — ${body.slice(0, 200)}`)
    }
    const data = await res.json() as { output?: string; exit_code?: number; error?: string }
    if (data.error) throw new Error(`exec: ${data.error}`)
    return data.output ?? ''
  },
}
