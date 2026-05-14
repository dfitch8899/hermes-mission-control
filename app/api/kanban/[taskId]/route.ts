import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { ddb, TABLES, GetCommand, QueryCommand, UpdateCommand } from '@/lib/dynamodb'
import { hermesClient } from '@/lib/hermesClient'
import type { KanbanTask, KanbanComment } from '@/types/kanban'

/** GET /api/kanban/[taskId] — single task + comment thread
 *  ?board=<slug>  optional (default "default")
 */
export async function GET(req: NextRequest, props: { params: Promise<{ taskId: string }> }) {
  const params = await props.params;
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
 *  All transitions update DynamoDB directly — instant and reliable.
 *  Only `done` and `blocked` also fire a best-effort Slack notification
 *  so Hermes can clean up any active workspace.  Metadata-only changes
 *  (assignee, title, priority, archive) are DDB-only to avoid Slack
 *  pollution from Hermes LLM misinterpreting the slash commands.
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ taskId: string }> }) {
  const params = await props.params;
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
        // Best-effort Hermes side-effect (mark workspace complete, clean up active session).
        hermesClient.kanbanComplete(taskId, body.result, senderName).catch(() => {})
      } else if (s === 'blocked') {
        hermesClient.kanbanBlock(taskId, body.reason, senderName).catch(() => {})
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
    // DDB only — no Slack notification.  Sending to Slack routes through
    // the Hermes LLM which misinterprets the command and pollutes the channel.
    if (body.assignee) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardPk, sk: `TASK#${taskId}` },
        UpdateExpression: 'SET assignee = :a, updatedAt = :ts',
        ExpressionAttributeValues: { ':a': body.assignee, ':ts': now },
      }))
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
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'No recognized update field' }, { status: 400 })
  } catch (err) {
    console.error(`[api/kanban/${taskId} PATCH]`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
