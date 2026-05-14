/**
 * Client-side helpers for reading the live agent list from /api/agents.
 *
 * Why this exists:
 *   The agent list is referenced from multiple surfaces (kanban TaskCard,
 *   TaskDrawer, the agents page itself, and any future filter/badge UI).
 *   Without a shared cache, each surface re-fetches on every mount.
 *
 * Semantics:
 *   - `fetchAgents()` returns a Promise that resolves to the current list.
 *     The first call hits /api/agents; subsequent calls return the cached
 *     promise.
 *   - `lookupAgent(id)` is a convenience for components that just need the
 *     icon/color/name for one assignee.
 *   - `invalidateAgentsCache()` lets a writer (editor save, delete) force
 *     the next reader to re-fetch.
 *
 * Server components should not import this — it relies on window fetch.
 */
import type { Agent } from '@/types/agent'

let cache: Promise<Agent[]> | null = null

export function fetchAgents(force = false): Promise<Agent[]> {
  if (force) cache = null
  if (!cache) {
    cache = fetch('/api/agents')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`/api/agents → ${r.status}`)))
      .then((d: { agents?: Agent[] }) => d.agents ?? [])
      .catch(err => { cache = null; throw err })  // don't memoize failure
  }
  return cache
}

export async function lookupAgent(agentId: string): Promise<Agent | null> {
  if (!agentId) return null
  try {
    const list = await fetchAgents()
    return list.find(a => a.agentId === agentId) ?? null
  } catch {
    return null
  }
}

export function invalidateAgentsCache() {
  cache = null
}
