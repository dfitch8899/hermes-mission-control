/**
 * GET /api/hermes/ping
 *
 * Diagnostic endpoint — tests direct connectivity to the Hermes dashboard and
 * returns full transport status.  Used by the terminal's `ping` command.
 *
 * Safe to call at any time; never mutates state.
 */
import { NextResponse } from 'next/server'
import { getHermesDashboardUrl } from '@/lib/hermesEndpoint'

const TRANSPORT  = process.env.HERMES_TRANSPORT ?? 'slack'
const HERMES_KEY = process.env.HERMES_SECRET_KEY

function authHeaders(): HeadersInit {
  return HERMES_KEY ? { 'X-Hermes-Key': HERMES_KEY } : {}
}

export async function GET() {
  const base = {
    transport:     TRANSPORT,
    keyConfigured: !!HERMES_KEY,
    keyPrefix:     HERMES_KEY ? HERMES_KEY.slice(0, 8) + '…' : null,
  }

  if (TRANSPORT !== 'direct') {
    return NextResponse.json({
      ...base,
      ok:     false,
      reason: 'HERMES_TRANSPORT is not "direct" — restart MC after updating .env.local',
    })
  }

  // Resolve the dashboard URL (auto-discovers from ECS if HERMES_DASHBOARD_URL is localhost)
  let dashboardUrl: string
  try {
    dashboardUrl = await getHermesDashboardUrl()
  } catch (err) {
    return NextResponse.json({
      ...base,
      ok:          false,
      dashboardUrl: null,
      reason:      `Discovery failed: ${String(err)}`,
    })
  }

  // 1. Primary liveness check — POST /api/mc/exec with "version" (auth required).
  //    mc_proxy handles this locally without needing the Hermes dashboard running.
  let execOk     = false
  let execOutput = ''
  let execStatus: number | null = null
  try {
    const r = await fetch(`${dashboardUrl}/api/mc/exec`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ command: 'version' }),
      signal:  AbortSignal.timeout(10_000),
    })
    execStatus = r.status
    if (r.ok) {
      const data = await r.json() as { output?: string; exit_code?: number }
      execOk     = data.exit_code === 0
      execOutput = data.output ?? ''
    }
  } catch { /* connection refused or timeout */ }

  // 2. Optional: authenticated model/options passthrough (requires Hermes dashboard running).
  let modelOk      = false
  let modelStatus: number | null = null
  let modelBody:   unknown       = null
  try {
    const r = await fetch(`${dashboardUrl}/api/model/options`, {
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
    ok:          execOk,
    dashboardUrl,
    exec:  { ok: execOk, httpStatus: execStatus, output: execOutput.slice(0, 200) },
    model: { ok: modelOk, httpStatus: modelStatus, body: modelBody },
    diagnosis: !execOk && execStatus === null
      ? `Proxy unreachable at ${dashboardUrl} — check SG port 9120 and mc_proxy.py startup`
      : !execOk && execStatus === 401
        ? 'Auth failed — HERMES_SECRET_KEY does not match what mc_proxy expects'
        : execOk && !modelOk
          ? 'Exec endpoint OK. Dashboard passthrough unavailable (model/kanban ops use Slack fallback)'
          : execOk && modelOk
            ? 'All good — direct transport is fully operational'
            : `Exec check failed (HTTP ${execStatus})`,
  })
}
