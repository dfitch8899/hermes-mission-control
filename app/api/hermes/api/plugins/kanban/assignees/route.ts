/**
 * Override route for the kanban plugin's `/assignees` endpoint.
 *
 * Mission Control owns the canonical list of "who can be assigned a task"
 * via the Agents page (`/agents`) and the `hermes-agents` DDB table.
 * The Hermes-side `/api/plugins/kanban/assignees` endpoint only knows about
 * profile directories that happen to exist in the container — a different
 * source of truth. When the user creates a custom MC agent they expect it
 * to appear in the kanban drawer's reassign dropdown.
 *
 * This route sits at the same path the plugin requests AND takes precedence
 * over the catch-all proxy at `app/api/hermes/[...path]/route.ts` (Next.js
 * picks the most specific route).
 *
 * Response shape matches what the plugin expects (per `known_assignees()`
 * in `kanban_db.py`):
 *
 *   { "assignees": [
 *       { "name": string, "on_disk": boolean, "counts": Record<string,number>,
 *         "label"?: string, "icon"?: string, "color"?: string }
 *     ] }
 *
 * `label`/`icon`/`color` are MC additions — the plugin ignores unknown
 * fields, so future plugin updates that want to render them work without
 * us coordinating a release.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, QueryCommand } from '@/lib/dynamodb'
import { getHermesDashboardUrl, invalidateHermesEndpointCache } from '@/lib/hermesEndpoint'

export const dynamic = 'force-dynamic'
export const runtime  = 'nodejs'

interface MCAgent {
  agentId: string
  name?: string
  icon?: string
  color?: string
}

interface HermesAssignee {
  name:    string
  on_disk: boolean
  counts:  Record<string, number>
}

interface MergedAssignee extends HermesAssignee {
  label?: string
  icon?:  string
  color?: string
}

/** Fetch every MC agent from DDB. */
async function fetchMCAgents(): Promise<MCAgent[]> {
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.agents,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'AGENT' },
    }))
    return (result.Items ?? []) as MCAgent[]
  } catch (err) {
    // Don't fail the whole endpoint if DDB is unreachable — fall back to
    // whatever Hermes returns. Log once for diagnosis.
    console.warn('[assignees-override] DDB fetch failed:', err)
    return []
  }
}

/** Fetch the Hermes-side assignees list (for counts + on_disk truth). */
async function fetchHermesAssignees(board: string | null, secret?: string): Promise<HermesAssignee[]> {
  try {
    const base   = await getHermesDashboardUrl()
    const url    = new URL(`${base}/api/plugins/kanban/assignees`)
    if (board) url.searchParams.set('board', board)
    const res = await fetch(url.toString(), {
      headers: secret ? { 'X-Hermes-Key': secret } : {},
    })
    if (!res.ok) {
      if (res.status >= 500) invalidateHermesEndpointCache()
      return []
    }
    const data = await res.json() as { assignees?: HermesAssignee[] }
    return data.assignees ?? []
  } catch (err) {
    invalidateHermesEndpointCache()
    console.warn('[assignees-override] Hermes fetch failed:', err)
    return []
  }
}

export async function GET(req: NextRequest) {
  const board  = req.nextUrl.searchParams.get('board')
  const secret = process.env.HERMES_SECRET_KEY

  const [mcAgents, hermesAssignees] = await Promise.all([
    fetchMCAgents(),
    fetchHermesAssignees(board, secret),
  ])

  // Index Hermes results by name so we can carry counts/on_disk through.
  const hermesByName = new Map<string, HermesAssignee>()
  for (const a of hermesAssignees) hermesByName.set(a.name, a)

  // MC is the source of truth for the list. Each MC agent gets an entry —
  // its `on_disk` reflects whether Hermes also knows about it (i.e. whether
  // the profile dir exists in the container), `counts` come from Hermes if
  // present, and `label`/`icon`/`color` are added so the plugin (or future
  // plugins) can render them.
  const merged: MergedAssignee[] = mcAgents.map(agent => {
    const fromHermes = hermesByName.get(agent.agentId)
    return {
      name:    agent.agentId,
      on_disk: fromHermes?.on_disk ?? false,
      counts:  fromHermes?.counts  ?? {},
      label:   agent.name,
      icon:    agent.icon,
      color:   agent.color,
    }
  })

  // Include any Hermes-only assignees that have actual tasks (so an
  // orphaned legacy assignee with open tasks still shows up — operator
  // can reassign them off it).
  const mcIds = new Set(mcAgents.map(a => a.agentId))
  for (const ha of hermesAssignees) {
    if (mcIds.has(ha.name)) continue
    const hasTasks = Object.values(ha.counts || {}).some(n => n > 0)
    if (!hasTasks) continue
    merged.push({ name: ha.name, on_disk: ha.on_disk, counts: ha.counts })
  }

  // Stable sort: MC agents first (by display name), then Hermes orphans.
  merged.sort((a, b) => {
    const aIsMC = mcIds.has(a.name)
    const bIsMC = mcIds.has(b.name)
    if (aIsMC !== bIsMC) return aIsMC ? -1 : 1
    return (a.label || a.name).localeCompare(b.label || b.name)
  })

  return NextResponse.json({ assignees: merged })
}
