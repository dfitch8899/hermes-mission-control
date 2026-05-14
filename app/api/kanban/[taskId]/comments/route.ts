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
export async function POST(req: NextRequest, props: { params: Promise<{ taskId: string }> }) {
  const params = await props.params;
  const { taskId } = params
  try {
    const body = await req.json().catch(() => ({})) as { text?: string }
    const text = (body.text ?? '').trim()
    if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

    const session    = await getServerSession(authOptions)
    const senderName = session?.user?.name ?? session?.user?.email ?? 'me'
    const now        = new Date().toISOString()
    const commentId  = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`

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
    //    Log failures so operators can spot a drift between MC and Hermes
    //    rather than silently swallowing.
    hermesClient.kanbanComment(taskId, text, senderName).catch((err) => {
      console.warn(`[api/kanban/${taskId}/comments] hermes mirror failed:`, err instanceof Error ? err.message : err)
    })

    return NextResponse.json({ ok: true, commentId })
  } catch (err) {
    console.error(`[api/kanban/${taskId}/comments POST]`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
