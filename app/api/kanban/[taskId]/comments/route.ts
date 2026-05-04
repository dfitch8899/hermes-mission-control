import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { postToSlack } from '@/lib/slack'

/** POST /api/kanban/[taskId]/comments — add comment via /kanban comment */
export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const { taskId } = params
  try {
    const body = await req.json().catch(() => ({})) as { text?: string }
    const text = (body.text ?? '').trim()
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

    const session    = await getServerSession(authOptions)
    const senderName = session?.user?.name ?? session?.user?.email ?? ''

    await postToSlack(`/kanban comment ${taskId} "${text.replace(/"/g, '\\"')}"`, senderName)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[api/kanban/${taskId}/comments POST]`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
