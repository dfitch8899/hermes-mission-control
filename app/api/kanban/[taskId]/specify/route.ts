import { NextRequest, NextResponse } from 'next/server'
import { hermesClient } from '@/lib/hermesClient'

/** POST /api/kanban/[taskId]/specify — flesh out a triage card via Hermes' auxiliary LLM
 *  ?board=<slug>  optional (default "default")
 *
 *  Proxies to Hermes' POST /api/plugins/kanban/tasks/{id}/specify, which
 *  reads the task's current title/body, runs the configured triage_specifier
 *  model, rewrites the fields, and promotes the task from `triage` → `todo`.
 *
 *  A non-OK outcome (e.g. `ok:false, reason: "no auxiliary client configured"`)
 *  is NOT treated as an error here — Hermes returns 200 with a structured
 *  reason that the UI surfaces inline. Only transport-level failures (Hermes
 *  unreachable, auth) become 500s.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await props.params
  const board = new URL(req.url).searchParams.get('board') ?? undefined
  try {
    const outcome = await hermesClient.kanbanSpecify(taskId, board)
    return NextResponse.json(outcome)
  } catch (err) {
    console.error(`[api/kanban/${taskId}/specify POST]`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
