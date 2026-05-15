import { NextRequest, NextResponse } from 'next/server'
import { hermesClient } from '@/lib/hermesClient'

/** GET /api/kanban/[taskId]/log — proxy to Hermes plugin's worker log
 *  ?board=<slug>  optional
 *  ?tail=<bytes>  optional, clamped by the Hermes plugin to [1, 2_000_000]
 *
 *  Returns the on-disk stdout/stderr of the task's most recent worker run.
 *  Used to diagnose dispatcher protocol violations ("worker exited rc=0
 *  without calling kanban_complete or kanban_block").
 *
 *  `exists: false` is a normal response — tasks that never spawned a
 *  worker (still in triage/todo/ready) won't have a log file.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await props.params
  const url   = new URL(req.url)
  const board = url.searchParams.get('board') ?? undefined
  const tailRaw = url.searchParams.get('tail')
  const tail  = tailRaw ? Number(tailRaw) : undefined
  // Drop NaN / non-finite quietly — Hermes will apply its own clamp.
  const tailBytes = (tail && Number.isFinite(tail) && tail > 0) ? Math.floor(tail) : undefined
  try {
    const out = await hermesClient.kanbanGetLog(taskId, { board, tailBytes })
    return NextResponse.json(out)
  } catch (err) {
    console.error(`[api/kanban/${taskId}/log GET]`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
