import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hermesKanban } from '@/lib/hermes-kanban'

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const board = new URL(req.url).searchParams.get('board') ?? 'default'

  try {
    const body = await req.json().catch(() => ({})) as { text?: string }
    const text = (body.text ?? '').trim()
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

    const session = await getServerSession(authOptions)
    const senderName = session?.user?.name ?? session?.user?.email ?? 'me'
    const result = await hermesKanban.addComment(params.taskId, text, senderName, board)
    return NextResponse.json(result)
  } catch (err) {
    console.error(`[api/kanban/${params.taskId}/comments POST]`, err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('required') ? 400 : message.includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
