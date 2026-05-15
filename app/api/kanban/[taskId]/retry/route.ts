import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, GetCommand } from '@/lib/dynamodb'
import { hermesClient } from '@/lib/hermesClient'

/** POST /api/kanban/[taskId]/retry — un-stick a parked task
 *  ?board=<slug>  optional (default "default")
 *  body { profile?: string }  optional override — defaults to current assignee
 *
 *  Calls Hermes' reassign-with-reclaim_first path (the canonical "retry"
 *  verb exposed by the dashboard recovery popover). Resolves the task's
 *  current assignee from the DDB mirror by default so a same-profile
 *  retry doesn't require the caller to know the existing assignee.
 *
 *  When does this help? After 2 consecutive_crashes Hermes' dispatcher
 *  parks a task. `reclaim_first=true` releases any orphaned worker claim
 *  and `reassign_task` clears the run history so the dispatcher will
 *  pick the task up again on its next pass.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await props.params
  const url     = new URL(req.url)
  const board   = url.searchParams.get('board') ?? undefined
  const boardPk = `BOARD#${board ?? 'default'}`

  try {
    const body = await req.json().catch(() => ({})) as { profile?: string }
    let profile: string | null | undefined = body.profile

    // No explicit profile → look up the current assignee from DDB. The
    // mirror keeps assignee in sync with Hermes' SQLite, so this matches
    // what Hermes thinks the profile is.
    if (profile === undefined) {
      const taskRes = await ddb.send(new GetCommand({
        TableName: TABLES.kanban,
        Key:       { pk: boardPk, sk: `TASK#${taskId}` },
      }))
      if (!taskRes.Item) {
        return NextResponse.json({ error: 'task not found in DDB mirror' }, { status: 404 })
      }
      const assignee = (taskRes.Item.assignee as string) || 'general'
      profile = assignee
    }

    const outcome = await hermesClient.kanbanReassign(taskId, {
      profile,
      reclaimFirst: true,
      reason:       'manual retry from MC log viewer',
      board,
    })
    return NextResponse.json(outcome)
  } catch (err) {
    console.error(`[api/kanban/${taskId}/retry POST]`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
