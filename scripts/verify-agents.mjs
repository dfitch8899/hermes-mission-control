#!/usr/bin/env node
/**
 * verify-agents.mjs — smoke test for the Mission Control agent system.
 *
 * Exercises the full /api/agents + /api/kanban data contract against a running
 * dev server. Prints PASS/FAIL per check; exits 0 only if every check passes.
 *
 * Usage:
 *   node scripts/verify-agents.mjs                 # against http://localhost:3000
 *   BASE=http://localhost:3001 node scripts/...    # custom origin
 *
 * Requires: Node 18+ (uses global fetch).
 */

const BASE = process.env.BASE || 'http://localhost:3000'

// ── tiny test harness ────────────────────────────────────────────────────────
let TOTAL = 0, PASSED = 0
const FAILED = []
const RESET = '\x1b[0m', GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m'

async function check(name, fn) {
  TOTAL++
  try {
    const ok = await fn()
    if (ok) {
      PASSED++
      console.log(`  ${GREEN}✓${RESET}  ${name}`)
    } else {
      FAILED.push(name)
      console.log(`  ${RED}✗${RESET}  ${name}`)
    }
  } catch (e) {
    FAILED.push(`${name} — ${e.message}`)
    console.log(`  ${RED}✗${RESET}  ${name} ${DIM}(${e.message})${RESET}`)
  }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function api(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  let body = null
  try { body = await r.json() } catch { /* not all responses are JSON */ }
  return { status: r.status, body, ok: r.ok }
}

// ── state populated as we go; cleanup runs in finally ───────────────────────
let NEW_AGENT_ID = ''
let TEST_TASK_ID = ''

async function cleanup() {
  if (TEST_TASK_ID) {
    await api(`/api/kanban/${TEST_TASK_ID}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) }).catch(() => {})
  }
  if (NEW_AGENT_ID) {
    await api(`/api/agents/${NEW_AGENT_ID}`, { method: 'DELETE' }).catch(() => {})
  }
}

// ── checks ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Verifying ${BASE}/api/agents …`)
  const preflight = await api('/api/agents').catch(() => ({ ok: false }))
  if (!preflight.ok) {
    console.error(`ERROR: ${BASE}/api/agents not reachable. Is 'npm run dev' running?`)
    process.exit(1)
  }

  // 1. Built-ins exist
  await check('GET /api/agents lists ≥ 4 agents (built-ins seeded)', async () => {
    const r = await api('/api/agents')
    return r.ok && Array.isArray(r.body.agents) && r.body.agents.length >= 4
  })

  // 2. Seed idempotent
  await check('POST /api/agents/seed is idempotent (no duplicate built-ins)', async () => {
    const before = (await api('/api/agents')).body.agents.length
    await api('/api/agents/seed', { method: 'POST' })
    const after  = (await api('/api/agents')).body.agents.length
    return before === after
  })

  // 3. Force reseed
  await check('POST /api/agents/seed?force=1 refreshes built-in coding model', async () => {
    await api('/api/agents/seed?force=1', { method: 'POST' })
    const r = await api('/api/agents/coding')
    return r.body?.agent?.orchestratorModel === 'gpt-5.4'
  })

  // 4. Create custom agent
  await check('POST /api/agents creates custom agent (returns agentId)', async () => {
    const r = await api('/api/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Verify Smoke Agent',
        icon: '🚀',
        color: '#f43f5e',
        orchestratorModel: 'gpt-4o',
        workerModel: 'gpt-4o-mini',
        orchestratorPolicy: 'always',
        systemPrompt: 'smoke',
      }),
    })
    NEW_AGENT_ID = r.body?.agent?.agentId
    return r.status === 201 && !!NEW_AGENT_ID
  })

  // 5. PATCH updates the agent
  await check('PATCH /api/agents/{id} updates systemPrompt', async () => {
    if (!NEW_AGENT_ID) return false
    await api(`/api/agents/${NEW_AGENT_ID}`, { method: 'PATCH', body: JSON.stringify({ systemPrompt: 'verified' }) })
    const r = await api(`/api/agents/${NEW_AGENT_ID}`)
    return r.body?.agent?.systemPrompt === 'verified'
  })

  // 6. DELETE built-in → 403
  await check('DELETE /api/agents/general returns 403 (built-in protected)', async () => {
    const r = await api('/api/agents/general', { method: 'DELETE' })
    return r.status === 403
  })

  // 7. POST /reset on custom agent → 403
  await check('POST /api/agents/{custom}/reset returns 403 (only built-ins resettable)', async () => {
    if (!NEW_AGENT_ID) return false
    const r = await api(`/api/agents/${NEW_AGENT_ID}/reset`, { method: 'POST' })
    return r.status === 403
  })

  // 8. POST /reset on built-in restores defaults
  await check('POST /api/agents/coding/reset restores canonical systemPrompt', async () => {
    await api('/api/agents/coding', { method: 'PATCH', body: JSON.stringify({ systemPrompt: 'DRIFTED' }) })
    const reset = await api('/api/agents/coding/reset', { method: 'POST' })
    if (reset.status !== 200) return false
    const r = await api('/api/agents/coding')
    return (r.body?.agent?.systemPrompt || '').includes('senior software engineer')
  })

  // 9. Create kanban task assigned to custom agent
  await check('POST /api/kanban with assignee=custom returns 202 + taskId', async () => {
    if (!NEW_AGENT_ID) return false
    const r = await api('/api/kanban', {
      method: 'POST',
      body: JSON.stringify({ title: 'verify-agents smoke task', assignee: NEW_AGENT_ID }),
    })
    TEST_TASK_ID = r.body?.taskId
    return r.status === 202 && !!TEST_TASK_ID
  })

  // 10. PATCH task assignee
  await check('PATCH /api/kanban/{taskId} reassigns to coding', async () => {
    if (!TEST_TASK_ID) return false
    await api(`/api/kanban/${TEST_TASK_ID}`, { method: 'PATCH', body: JSON.stringify({ assignee: 'coding' }) })
    const r = await api('/api/kanban?assignee=coding')
    const found = (r.body?.tasks ?? []).find(t => t.taskId === TEST_TASK_ID)
    return found?.assignee === 'coding'
  })

  // 11. Filter by assignee
  await check('GET /api/kanban?assignee=… filters correctly (in / out)', async () => {
    if (!TEST_TASK_ID) return false
    const inList  = (await api('/api/kanban?assignee=coding')).body?.tasks ?? []
    const outList = (await api('/api/kanban?assignee=research')).body?.tasks ?? []
    return inList.some(t => t.taskId === TEST_TASK_ID) && !outList.some(t => t.taskId === TEST_TASK_ID)
  })

  // 12. Usage endpoint
  await check('GET /api/agents/usage counts the test task under coding', async () => {
    const r = await api('/api/agents/usage')
    return (r.body?.counts?.coding ?? 0) >= 1
  })

  // 13. DELETE custom agent
  await check('DELETE /api/agents/{custom} succeeds', async () => {
    if (!NEW_AGENT_ID) return false
    const r = await api(`/api/agents/${NEW_AGENT_ID}`, { method: 'DELETE' })
    if (r.status !== 200) return false
    NEW_AGENT_ID = ''  // prevent cleanup re-delete
    return true
  })

  // 14. Hermes profile-sync status probe responds with a recognized status
  //     (PASS regardless of whether Hermes is reachable today — we're verifying
  //     the probe itself works, not that the auth wall is open. See
  //     docs/hermes-profile-sync.md for the upstream patch.)
  await check('GET /api/hermes/profile-sync/status returns a valid SyncResult', async () => {
    const r = await api('/api/hermes/profile-sync/status')
    if (!r.ok) return false
    const known = ['reachable', 'auth_blocked', 'transport_disabled', 'network_error']
    return typeof r.body?.ok === 'boolean' && known.includes(r.body?.status)
  })

  // ── summary ────────────────────────────────────────────────────────────────
  console.log()
  if (PASSED === TOTAL) {
    console.log(`${GREEN}PASS: ${PASSED}/${TOTAL}${RESET}`)
    process.exit(0)
  } else {
    console.log(`${RED}FAIL: ${PASSED}/${TOTAL}${RESET}`)
    for (const f of FAILED) console.log(`  ${RED}✗${RESET} ${f}`)
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(cleanup)
