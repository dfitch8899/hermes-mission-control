/**
 * MC → Hermes profile sync.
 *
 * Mission Control's `/agents` page maintains rich agent definitions
 * (systemPrompt, orchestratorModel, workerModel, ...) in DynamoDB. The
 * Hermes backend runs the actual agent loop using its own per-profile
 * config files at `/opt/data/profiles/<name>/`:
 *
 *   /opt/data/profiles/<name>/SOUL.md       — system prompt
 *   /opt/data/profiles/<name>/config.yaml   — model + orchestration policy
 *   /opt/data/profiles/<name>/.env          — provider keys
 *
 * Without sync the two systems drift: an MC user edits the systemPrompt
 * thinking it changes Hermes's behavior — and it doesn't, because Hermes
 * reads SOUL.md, not MC's DynamoDB.
 *
 * BRIDGE: hermes-agent's `patches/mc_proxy.py` exposes
 *   GET|PUT /api/mc/profile-soul/{name}
 * which writes/reads SOUL.md directly under the X-Hermes-Key auth that
 * MC already carries (bypassing the dashboard session cookie wall that
 * blocked the previous integration attempt against /api/profiles/*).
 *
 * Profile create/delete piggy-back on the existing `/api/mc/exec`
 * endpoint via `hermes profile create/delete` CLI subcommands which are
 * already in mc_proxy.py's EXEC_WHITELIST.
 *
 * Auth status is probed via `probeProfileSync()` so the MC `/agents`
 * page can show an honest reachability banner.
 */

import { getHermesDashboardUrl } from './hermesEndpoint'
import type { Agent } from '@/types/agent'

const KEY = process.env.HERMES_SECRET_KEY
const USE_DIRECT = process.env.HERMES_TRANSPORT === 'direct'

function authHeaders(): Record<string, string> {
  return KEY ? { 'X-Hermes-Key': KEY } : {}
}

export interface SyncResult {
  ok: boolean
  /** 'reachable' | 'auth_blocked' | 'transport_disabled' | 'network_error' */
  status: 'reachable' | 'auth_blocked' | 'transport_disabled' | 'network_error'
  detail?: string
  httpStatus?: number
}

/**
 * Reachability probe — does NOT mutate anything. Used by the agents
 * page banner and the /api/hermes/profile-sync/status route.
 *
 * Probes GET /api/mc/profile-soul/general (a known-existing built-in
 * profile). A 200 means the bridge is live; a 404 means the bridge is
 * live but the profile is missing (still "reachable" for our purposes);
 * a 401/403 means mc_proxy.py is older than the bridge patch.
 */
export async function probeProfileSync(): Promise<SyncResult> {
  if (!USE_DIRECT) {
    return { ok: false, status: 'transport_disabled', detail: 'HERMES_TRANSPORT != direct' }
  }
  let base: string
  try { base = await getHermesDashboardUrl() }
  catch (e) {
    return { ok: false, status: 'network_error', detail: (e as Error).message }
  }
  try {
    const res = await fetch(`${base}/api/mc/profile-soul/general`, {
      method:  'GET',
      headers: authHeaders(),
      signal:  AbortSignal.timeout(8_000),
    })
    if (res.ok || res.status === 404) {
      return { ok: true, status: 'reachable', httpStatus: res.status }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 'auth_blocked', httpStatus: res.status,
        detail: 'mc_proxy.py is older than the profile-soul bridge patch (rev ≥ 50)' }
    }
    return { ok: false, status: 'network_error', httpStatus: res.status,
      detail: `unexpected status ${res.status}` }
  } catch (e) {
    return { ok: false, status: 'network_error', detail: (e as Error).message }
  }
}

/**
 * Create a Hermes profile named for the agent via `hermes profile create`
 * over the existing /api/mc/exec endpoint. No-op on already-exists.
 */
export async function syncCreateProfile(agentId: string): Promise<SyncResult> {
  if (!USE_DIRECT) return { ok: false, status: 'transport_disabled' }
  // Name validation guard: only [a-z0-9_-] — same charset mc_proxy enforces
  if (!/^[a-z0-9_-]+$/.test(agentId)) {
    return { ok: false, status: 'network_error', detail: 'invalid profile name (must be [a-z0-9_-])' }
  }
  try {
    const base = await getHermesDashboardUrl()
    const res  = await fetch(`${base}/api/mc/exec`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ command: `profile create ${agentId} --no-skills` }),
      signal:  AbortSignal.timeout(30_000),
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 'auth_blocked', httpStatus: res.status }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, status: 'network_error', httpStatus: res.status, detail: body.slice(0, 200) }
    }
    const data = await res.json().catch(() => ({} as { output?: string; exit_code?: number }))
    const output = String(data.output ?? '')
    // exit 0 = created; or already-exists in output text = also fine
    if (data.exit_code === 0 || /already exists|exists at/i.test(output)) {
      return { ok: true, status: 'reachable', httpStatus: 200, detail: output.slice(0, 200) }
    }
    return { ok: false, status: 'network_error', httpStatus: 200, detail: `exit ${data.exit_code}: ${output.slice(0, 200)}` }
  } catch (e) {
    return { ok: false, status: 'network_error', detail: (e as Error).message }
  }
}

/**
 * Push the agent's systemPrompt into the profile's SOUL.md via the
 * mc_proxy bridge (PUT /api/mc/profile-soul/{name}).
 * SOUL.md is plain markdown; we wrap the prompt in an # Identity header
 * so Hermes's existing SOUL parser picks it up.
 */
export async function syncAgentSoul(agentId: string, systemPrompt: string): Promise<SyncResult> {
  if (!USE_DIRECT) return { ok: false, status: 'transport_disabled' }
  if (!/^[a-z0-9_-]+$/.test(agentId)) {
    return { ok: false, status: 'network_error', detail: 'invalid profile name' }
  }
  const body = systemPrompt?.trim()
    ? `# Identity\n\n${systemPrompt.trim()}\n`
    : `# Identity\n\n(no system prompt configured — Mission Control agent is empty)\n`
  try {
    const base = await getHermesDashboardUrl()
    const res  = await fetch(`${base}/api/mc/profile-soul/${encodeURIComponent(agentId)}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ content: body }),
      signal:  AbortSignal.timeout(15_000),
    })
    if (res.ok) return { ok: true, status: 'reachable', httpStatus: res.status }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 'auth_blocked', httpStatus: res.status }
    }
    if (res.status === 404) {
      return { ok: false, status: 'network_error', httpStatus: 404,
        detail: 'profile dir missing on Hermes — call syncCreateProfile first' }
    }
    const detail = await res.text().catch(() => '')
    return { ok: false, status: 'network_error', httpStatus: res.status, detail: detail.slice(0, 200) }
  } catch (e) {
    return { ok: false, status: 'network_error', detail: (e as Error).message }
  }
}

/**
 * Delete the corresponding Hermes profile via `hermes profile delete`
 * over /api/mc/exec. Built-in profiles MUST NOT be deleted — caller is
 * responsible for blocking based on `isBuiltin`.
 */
export async function syncDeleteProfile(agentId: string): Promise<SyncResult> {
  if (!USE_DIRECT) return { ok: false, status: 'transport_disabled' }
  if (!/^[a-z0-9_-]+$/.test(agentId)) {
    return { ok: false, status: 'network_error', detail: 'invalid profile name' }
  }
  try {
    const base = await getHermesDashboardUrl()
    const res  = await fetch(`${base}/api/mc/exec`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ command: `profile delete ${agentId} --yes` }),
      signal:  AbortSignal.timeout(30_000),
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 'auth_blocked', httpStatus: res.status }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, status: 'network_error', httpStatus: res.status, detail: body.slice(0, 200) }
    }
    const data = await res.json().catch(() => ({} as { output?: string; exit_code?: number }))
    const output = String(data.output ?? '')
    if (data.exit_code === 0 || /does not exist|not found/i.test(output)) {
      return { ok: true, status: 'reachable', httpStatus: 200, detail: output.slice(0, 200) }
    }
    return { ok: false, status: 'network_error', httpStatus: 200, detail: `exit ${data.exit_code}: ${output.slice(0, 200)}` }
  } catch (e) {
    return { ok: false, status: 'network_error', detail: (e as Error).message }
  }
}

/**
 * Combined push: create-if-missing + soul update. Fire-and-forget from
 * the caller's perspective — returns a single SyncResult summarizing
 * the soul update (which is the meaningful behavioral state).
 *
 * Logs a single console.warn line on auth_blocked so the dev console
 * makes the integration gap visible without spamming.
 */
export async function syncAgent(agent: Pick<Agent, 'agentId' | 'systemPrompt'>): Promise<SyncResult> {
  await syncCreateProfile(agent.agentId)
  const result = await syncAgentSoul(agent.agentId, agent.systemPrompt ?? '')
  if (result.status === 'auth_blocked') {
    console.warn(
      `[hermesProfileSync] sync of "${agent.agentId}" blocked (HTTP ${result.httpStatus}). ` +
      `mc_proxy.py is older than the bridge patch (task def rev < 50). ` +
      `See docs/hermes-profile-sync.md.`
    )
  } else if (!result.ok) {
    console.warn(
      `[hermesProfileSync] sync of "${agent.agentId}" failed: ${result.status} ${result.httpStatus ?? ''} ${result.detail ?? ''}`
    )
  }
  return result
}
