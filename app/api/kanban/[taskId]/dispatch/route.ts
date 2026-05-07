import { NextRequest, NextResponse } from 'next/server'
import { hermesKanban } from '@/lib/hermes-kanban'

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const board = new URL(req.url).searchParams.get('board') ?? 'default'

  try {
    const result = await hermesKanban.dispatchTask(params.taskId, { board })
    return NextResponse.json(result)
  } catch (err) {
    console.error(`[api/kanban/${params.taskId}/dispatch POST]`, err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not available') ? 409 : message.includes('assign') ? 409 : message.includes('triage') ? 409 : message.includes('finished') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
