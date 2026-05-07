import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hermesKanban } from '@/lib/hermes-kanban'

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const board = new URL(req.url).searchParams.get('board') ?? 'default'

  try {
    const result = await hermesKanban.getTask(params.taskId, { board })
    return NextResponse.json({ ...result, backend: hermesKanban.lastBackendUsed })
  } catch (err) {
    console.error(`[api/kanban/${params.taskId} GET]`, err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const board = new URL(req.url).searchParams.get('board') ?? 'default'

  try {
    const body = await req.json().catch(() => ({})) as {
      status?: string
      reason?: string
      result?: string
      assignee?: string
      archived?: boolean
      title?: string
      priority?: string
    }

    const session = await getServerSession(authOptions)
    const senderName = session?.user?.name ?? session?.user?.email ?? 'Mission Control'
    const result = await hermesKanban.updateTask(params.taskId, body, senderName, board)
    return NextResponse.json(result)
  } catch (err) {
    console.error(`[api/kanban/${params.taskId} PATCH]`, err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('No recognized') ? 400 : message.includes('not found') ? 404 : message.includes('not valid') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
