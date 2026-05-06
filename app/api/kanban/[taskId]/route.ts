import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { ddb, TABLES, GetCommand, QueryCommand } from '@/lib/dynamodb'
import { postToSlack } from '@/lib/slack'
import type { KanbanTask, KanbanComment } from '@/types/kanban'

/** GET /api/kanban/[taskId] — single task + comment thread
 *  ?board=<slug>  optional (default "default")
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const { taskId } = params
  const board = new URL(req.url).searchParams.get('board') ?? 'default'
  const boardPk = `BOARD#${board}`
  try {
    const [taskRes, commentsRes] = await Promise.all([
      ddb.send(new GetCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardPk, sk: `TASK#${taskId}` },
      })),
      ddb.send(new QueryCommand({
        TableName: TABLES.kanban,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': `TASK#${taskId}`, ':prefix': 'COMMENT#' },
        ScanIndexForward: true,
      })),
    ])

    if (!taskRes.Item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const item = taskRes.Item
    const task: KanbanTask = {
      taskId:        item.taskId        as string,
      title:         item.title         as string,
      body:          (item.body         as string) || '',
      status:        (item.status       as KanbanTask['status']) || 'triage',
      assignee:      (item.assignee     as string) || 'general',
      priority:      (item.priority     as KanbanTask['priority']) || 'normal',
      tenant:        item.tenant        as string | undefined,
      workspaceType: item.workspaceType as string | undefined,
      parentIds:     (item.parentIds    as string[]) ?? [],
      childIds:      (item.childIds     as string[]) ?? [],
      commentCount:  (item.commentCount as number) ?? 0,
      createdAt:     item.createdAt     as string,
      updatedAt:     item.updatedAt     as string,
      completedAt:   item.completedAt   as string | undefined,
      archivedAt:    item.archivedAt    as string | undefined,
    }

    const comments: KanbanComment[] = (commentsRes.Items ?? []).map(c => ({
      commentId: c.commentId as string,
      body:      c.body      as string,
      author:    c.author    as string,
      ts:        c.ts        as string,
    }))

    return NextResponse.json({ task, comments })
  } catch (err) {
    console.error(`[api/kanban/${taskId} GET]`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** PATCH /api/kanban/[taskId] — state transitions via slash commands */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const { taskId } = params
  try {
    const body = await req.json().catch(() => ({})) as {
      status?:   string
      reason?:   string
      result?:   string
      assignee?: string
      archived?: boolean
      title?:    string
      priority?: string
    }

    const session    = await getServerSession(authOptions)
    const senderName = session?.user?.name ?? session?.user?.email ?? ''

    let cmd = ''

    if (body.archived) {
      cmd = `/kanban archive ${taskId}`
    } else if (body.status === 'done') {
      cmd = `/kanban complete ${taskId}${body.result ? ` "${body.result}"` : ''}`
    } else if (body.status === 'blocked') {
      cmd = `/kanban block ${taskId}${body.reason ? ` "${body.reason}"` : ''}`
    } else if (body.status === 'ready' || body.status === 'todo') {
      cmd = `/kanban unblock ${taskId}`
    } else if (body.assignee) {
      cmd = `/kanban assign ${taskId} ${body.assignee}`
    } else if (body.title) {
      cmd = `/kanban rename ${taskId} "${body.title}"`
    } else if (body.priority) {
      cmd = `/kanban priority ${taskId} ${body.priority}`
    } else {
      return NextResponse.json({ error: 'No recognized update field' }, { status: 400 })
    }

    await postToSlack(cmd, senderName)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[api/kanban/${taskId} PATCH]`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
