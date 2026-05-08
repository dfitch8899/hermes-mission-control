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

const DASHBOARD_URL = process.env.HERMES_DASHBOARD_URL?.replace(/\/$/, '')
// Reserved for future use when the dashboard session-token auth is wired up.
// Currently unused: kanban routes are unauthenticated, model routes fall back to Slack.
const HERMES_KEY = process.env.HERMES_SECRET_KEY

function authHeaders(): HeadersInit {
  return HERMES_KEY ? { 'X-Hermes-Key': HERMES_KEY } : {}
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
  async chatSend(_opts: ChatSendOptions): Promise<string | null> {
    // Phase 3: Requires a streaming SSE /mc/chat endpoint on the Hermes side.
    // Fall back to Slack until that is implemented.
    throw new Error('hermesClient.direct: chatSend not yet implemented (Phase 3)')
  },

  async kanbanComplete(taskId, result, _senderName) {
    if (!DASHBOARD_URL) throw new Error('HERMES_DASHBOARD_URL not set')
    const body: Record<string, unknown> = { status: 'done' }
    if (result) body.result = result
    const res = await fetch(`${DASHBOARD_URL}/api/plugins/kanban/tasks/${taskId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    })
    await checkResponse(res, `kanbanComplete(${taskId})`)
  },

  async kanbanBlock(taskId, reason, _senderName) {
    if (!DASHBOARD_URL) throw new Error('HERMES_DASHBOARD_URL not set')
    // Dashboard API uses block_reason (not reason) per plugin_api.py UpdateTaskBody
    const body: Record<string, unknown> = { status: 'blocked' }
    if (reason) body.block_reason = reason
    const res = await fetch(`${DASHBOARD_URL}/api/plugins/kanban/tasks/${taskId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    })
    await checkResponse(res, `kanbanBlock(${taskId})`)
  },

  async kanbanComment(taskId, text, _senderName) {
    if (!DASHBOARD_URL) throw new Error('HERMES_DASHBOARD_URL not set')
    // Plugin API expects { body: string } per CommentBody model
    const res = await fetch(`${DASHBOARD_URL}/api/plugins/kanban/tasks/${taskId}/comments`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ body: text }),
    })
    await checkResponse(res, `kanbanComment(${taskId})`)
  },

  async modelSet(model) {
    if (!DASHBOARD_URL) throw new Error('HERMES_DASHBOARD_URL not set')

    // Step 1: resolve the current provider (required field for /api/model/set).
    // /api/model/options needs the auth header on authenticated Hermes builds.
    let provider = 'openai-codex'  // safe default — overridden below
    try {
      const optsRes = await fetch(`${DASHBOARD_URL}/api/model/options`, {
        headers: authHeaders(),
        signal:  AbortSignal.timeout(5_000),
      })
      if (optsRes.ok) {
        const optsData = await optsRes.json() as {
          providers?: Array<{ slug: string; is_current: boolean; models?: string[] }>
        }
        const current = optsData.providers?.find(p => p.is_current)
        if (current) provider = current.slug
      }
    } catch { /* use default provider */ }

    // Step 2: set the model.
    // Do NOT send `scope` — it was a guess and Hermes 422s if it doesn't recognise it.
    // The dashboard /model command sets globally by default.
    const res = await fetch(`${DASHBOARD_URL}/api/model/set`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ provider, model }),
      signal:  AbortSignal.timeout(5_000),
    })
    await checkResponse(res, `modelSet(${model})`)
  },

  async exec(_command, _senderName) {
    // Phase 3: Requires a whitelisted /mc/exec endpoint on the Hermes side.
    // Fall back to Slack until that is implemented.
    throw new Error('hermesClient.direct: exec not yet implemented (Phase 3)')
  },
}
