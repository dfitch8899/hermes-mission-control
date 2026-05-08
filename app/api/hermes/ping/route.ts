/**
 * GET /api/hermes/ping
 *
 * Diagnostic endpoint — tests direct connectivity to the Hermes dashboard and
 * returns full transport status.  Used by the terminal's `ping` command.
 *
 * Safe to call at any time; never mutates state.
 */
import { NextResponse } from 'next/server'

const DASHBOARD_URL = process.env.HERMES_DASHBOARD_URL?.replace(/\/$/, '')
const TRANSPORT     = process.env.HERMES_TRANSPORT ?? 'slack'
const HERMES_KEY    = process.env.HERMES_SECRET_KEY

function authHeaders(): HeadersInit {
  return HERMES_KEY ? { 'X-Hermes-Key': HERMES_KEY } : {}
}

export async function GET() {
  const base = {
    transport:    TRANSPORT,
    dashboardUrl: DASHBOARD_URL ?? null,
    keyConfigured: !!HERMES_KEY,
    keyPrefix:    HERMES_KEY ? HERMES_KEY.slice(0, 8) + '…' : null,
  }

  if (TRANSPORT !== 'direct' || !DASHBOARD_URL) {
    return NextResponse.json({
      ...base,
      ok:     false,
      reason: TRANSPORT !== 'direct'
        ? 'HERMES_TRANSPORT is not "direct" — restart MC after updating .env.local'
        : 'HERMES_DASHBOARD_URL is not set',
    })
  }

  // 1. Test unauthenticated kanban route (no auth needed — confirms port forward is live)
  let kanbanReachable = false
  let kanbanStatus: number | null = null
  try {
    const r = await fetch(`${DASHBOARD_URL}/api/plugins/kanban/board`, {
      signal: AbortSignal.timeout(4_000),
    })
    kanbanStatus    = r.status
    kanbanReachable = r.ok || r.status === 404  // 404 means route exists but no board — still reachable
  } catch { /* will show in error below */ }

  // 2. Test authenticated model/options route (needs X-Hermes-Key)
  let modelOk      = false
  let modelStatus: number | null = null
  let modelBody:   unknown       = null
  try {
    const r = await fetch(`${DASHBOARD_URL}/api/model/options`, {
      headers: authHeaders(),
      signal:  AbortSignal.timeout(4_000),
    })
    modelStatus = r.status
    modelOk     = r.ok
    if (r.ok) modelBody = await r.json()
  } catch (err) {
    modelBody = String(err)
  }

  return NextResponse.json({
    ...base,
    ok: kanbanReachable && modelOk,
    kanban: { reachable: kanbanReachable, httpStatus: kanbanStatus },
    model:  { ok: modelOk, httpStatus: modelStatus, body: modelBody },
    diagnosis: !kanbanReachable
      ? 'Port forward not active — run: ./scripts/hermes-forward.sh'
      : !modelOk && modelStatus === 401
        ? 'Auth failed — HERMES_SECRET_KEY does not match what Hermes expects'
        : !modelOk && modelStatus === 403
          ? 'Forbidden — check patch_web_server.py is running in the Hermes container'
          : modelOk
            ? 'All good — direct transport is operational'
            : `Unexpected error (HTTP ${modelStatus})`,
  })
}
