import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { ddb, TABLES, GetCommand, QueryCommand, UpdateCommand } from '@/lib/dynamodb'
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

/** PATCH /api/kanban/[taskId] — state transitions
 *  ?board=<slug>  optional (default "default")
 *
 *  All transitions update DynamoDB directly so they are instant and
 *  reliable (the previous Slack-only approach let the LLM drop flags).
 *  For transitions that have Hermes side-effects (done, blocked, assignee)
 *  we ALSO fire the slash command as a best-effort background notification.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const { taskId } = params
  const board     = new URL(req.url).searchParams.get('board') ?? 'default'
  const boardPk   = `BOARD#${board}`

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
    const now        = new Date().toISOString()

    // ── Archive ─────────────────────────────────────────────────────────────
    if (body.archived) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardPk, sk: `TASK#${taskId}` },
        UpdateExpression: 'SET archivedAt = :ts, updatedAt = :ts2',
        ExpressionAttributeValues: { ':ts': now, ':ts2': now },
      }))
      // Best-effort Hermes notification
      postToSlack(`/kanban archive ${taskId}`, senderName).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    // ── Status transition ───────────────────────────────────────────────────
    if (body.status) {
      const s = body.status

      // Build the update expression
      let updateExpr = 'SET #st = :s, updatedAt = :ts'
      const attrNames: Record<string, string>  = { '#st': 'status' }
      const attrValues: Record<string, unknown> = { ':s': s, ':ts': now }

      if (s === 'done') {
        updateExpr += ', completedAt = :ts'
        // Best-effort Hermes side-effect (mark workspace complete etc.)
        const result = body.result ? ` "${body.result}"` : ''
        postToSlack(`/kanban complete ${taskId}${result}`, senderName).catch(() => {})
      } else if (s === 'blocked') {
        const reason = body.reason ? ` "${body.reason}"` : ''
        postToSlack(`/kanban block ${taskId}${reason}`, senderName).catch(() => {})
      }
      // 'running', 'triage', 'todo', 'ready' → DDB only (no Hermes CLI equivalent)

      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardPk, sk: `TASK#${taskId}` },
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: attrNames,
        ExpressionAttributeValues: attrValues,
      }))
      return NextResponse.json({ ok: true })
    }

    // ── Assignee ────────────────────────────────────────────────────────────
    if (body.assignee) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardPk, sk: `TASK#${taskId}` },
        UpdateExpression: 'SET assignee = :a, updatedAt = :ts',
        ExpressionAttributeValues: { ':a': body.assignee, ':ts': now },
      }))
      postToSlack(`/kanban assign ${taskId} ${body.assignee}`, senderName).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    // ── Title rename ────────────────────────────────────────────────────────
    if (body.title) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardPk, sk: `TASK#${taskId}` },
        UpdateExpression: 'SET title = :t, updatedAt = :ts',
        ExpressionAttributeValues: { ':t': body.title, ':ts': now },
      }))
      postToSlack(`/kanban rename ${taskId} "${body.title}"`, senderName).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    // ── Priority ────────────────────────────────────────────────────────────
    if (body.priority) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardPk, sk: `TASK#${taskId}` },
        UpdateExpression: 'SET priority = :p, updatedAt = :ts',
        ExpressionAttributeValues: { ':p': body.priority, ':ts': now },
      }))
      postToSlack(`/kanban priority ${taskId} ${body.priority}`, senderName).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'No recognized update field' }, { status: 400 })
  } catch (err) {
    console.error(`[api/kanban/${taskId} PATCH]`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
