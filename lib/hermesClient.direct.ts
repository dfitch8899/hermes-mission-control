/**
 * Direct-HTTP transport for the Hermes command client.
 *
 * Calls the Hermes dashboard REST API (localhost:9119 in the same ECS container)
 * and the kanban plugin API directly, bypassing the Slack relay.
 *
 * Phase 2 status: stub — methods throw "not configured" until HERMES_DASHBOARD_URL
 * is set (requires `hermes dashboard --no-open` added to the ECS task startup).
 * When not configured, hermesClient.ts falls back to the Slack transport automatically.
 */

import type { HermesTransport, ChatSendOptions } from './hermesClient.types'

const DASHBOARD_URL = process.env.HERMES_DASHBOARD_URL?.replace(/\/$/, '')
// MC → Hermes auth: same key that Hermes already uses for the reverse direction
// (app/api/hermes/update/route.ts validates X-Hermes-Key from incoming Hermes calls).
const HERMES_KEY    = process.env.HERMES_SECRET_KEY

function authHeaders(): HeadersInit {
  return HERMES_KEY ? { 'X-Hermes-Key': HERMES_KEY } : {}
}

export const directTransport: HermesTransport = {
  async chatSend(_opts: ChatSendOptions): Promise<string | null> {
    // Phase 2: POST ${DASHBOARD_URL}/mc/chat with SSE streaming.
    // The dashboard currently has no /mc/chat endpoint; this requires a gateway patch.
    throw new Error('hermesClient.direct: chatSend not yet implemented (Phase 2)')
  },

  async kanbanComplete(taskId, result, _senderName) {
    if (!DASHBOARD_URL) throw new Error('HERMES_DASHBOARD_URL not set')
    const body: Record<string, unknown> = { status: 'done' }
    if (result) body.result = result
    await fetch(`${DASHBOARD_URL}/api/plugins/kanban/tasks/${taskId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    })
  },

  async kanbanBlock(taskId, reason, _senderName) {
    if (!DASHBOARD_URL) throw new Error('HERMES_DASHBOARD_URL not set')
    const body: Record<string, unknown> = { status: 'blocked' }
    if (reason) body.reason = reason
    await fetch(`${DASHBOARD_URL}/api/plugins/kanban/tasks/${taskId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify(body),
    })
  },

  async kanbanComment(taskId, text, _senderName) {
    if (!DASHBOARD_URL) throw new Error('HERMES_DASHBOARD_URL not set')
    await fetch(`${DASHBOARD_URL}/api/plugins/kanban/tasks/${taskId}/comments`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ body: text }),
    })
  },

  async modelSet(model) {
    if (!DASHBOARD_URL) throw new Error('HERMES_DASHBOARD_URL not set')
    await fetch(`${DASHBOARD_URL}/api/model/set`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ scope: 'main', model }),
    })
  },

  async exec(command, _senderName) {
    if (!DASHBOARD_URL) throw new Error('HERMES_DASHBOARD_URL not set')
    // Phase 2: POST to a whitelisted /mc/exec endpoint (requires gateway patch).
    // For now, flag as unimplemented so the caller falls back to Slack.
    throw new Error(`hermesClient.direct: exec not yet implemented (Phase 2) — command: ${command}`)
  },
}
