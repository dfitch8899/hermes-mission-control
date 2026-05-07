import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { ddb, TABLES, PutCommand } from '@/lib/dynamodb'
import { hermesClient } from '@/lib/hermesClient'

/** POST /api/kanban/[taskId]/comments
 *
 *  1. Writes the comment directly to DynamoDB so it appears in the task drawer
 *     immediately (no mirror round-trip required).
 *  2. Also notifies Hermes via the command client so the SQLite DB stays in sync.
 */
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
    const senderName = session?.user?.name ?? session?.user?.email ?? 'me'
    const now        = new Date().toISOString()
    const commentId  = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    // 1. Persist directly to DynamoDB — visible immediately in the task drawer.
    await ddb.send(new PutCommand({
      TableName: TABLES.kanban,
      Item: {
        pk:        `TASK#${taskId}`,
        sk:        `COMMENT#${now}#${commentId}`,
        commentId,
        body:      text,
        author:    senderName,
        ts:        now,
      },
    }))

    // 2. Notify Hermes so its SQLite kanban.db stays in sync.
    //    Best-effort — UI already shows the comment from DDB regardless.
    hermesClient.kanbanComment(taskId, text, senderName).catch(() => {})

    return NextResponse.json({ ok: true, commentId })
  } catch (err) {
    console.error(`[api/kanban/${taskId}/comments POST]`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
