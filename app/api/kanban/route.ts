import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, QueryCommand, PutCommand } from '@/lib/dynamodb'
import type { KanbanTask, KanbanStatus } from '@/types/kanban'
import { randomBytes } from 'crypto'

function boardPk(slug: string) {
  return `BOARD#${slug}`
}

/** GET /api/kanban — list all tasks
 *  ?board=<slug>    default "default"
 *  ?status=<s>      filter by column
 *  ?assignee=<a>    filter by agent
 *  ?search=<q>      substring match on title/body
 *  ?includeArchived  include archived tasks
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const board            = searchParams.get('board')    ?? 'default'
  const statusFilter     = searchParams.get('status')   as KanbanStatus | null
  const assigneeFilter   = searchParams.get('assignee')
  const searchQuery      = searchParams.get('search')?.toLowerCase()
  const includeArchived  = searchParams.has('includeArchived')

  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.kanban,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': boardPk(board), ':prefix': 'TASK#' },
    }))

    let tasks: KanbanTask[] = (result.Items ?? []).map(item => ({
      taskId:        item.taskId        as string,
      title:         item.title         as string,
      body:          (item.body         as string) || '',
      status:        (item.status       as KanbanStatus) || 'triage',
      assignee:      (item.assignee     as string) || 'general',
      priority:      (item.priority     as 'low' | 'normal' | 'high' | 'critical') || 'normal',
      tenant:        item.tenant        as string | undefined,
      workspaceType: item.workspaceType as string | undefined,
      tags:          (item.tags         as string[]) ?? [],
      parentIds:     (item.parentIds    as string[]) ?? [],
      childIds:      (item.childIds     as string[]) ?? [],
      commentCount:  (item.commentCount as number) ?? 0,
      boardSlug:     board,
      createdAt:     item.createdAt     as string,
      updatedAt:     item.updatedAt     as string,
      completedAt:   item.completedAt   as string | undefined,
      archivedAt:    item.archivedAt    as string | undefined,
    }))

    // Filters
    if (!includeArchived) tasks = tasks.filter(t => !t.archivedAt)
    if (statusFilter)     tasks = tasks.filter(t => t.status === statusFilter)
    if (assigneeFilter)   tasks = tasks.filter(t => t.assignee === assigneeFilter)
    if (searchQuery) {
      tasks = tasks.filter(t =>
        t.title.toLowerCase().includes(searchQuery) ||
        t.body.toLowerCase().includes(searchQuery) ||
        (t.tags ?? []).some(tag => tag.toLowerCase().includes(searchQuery))
      )
    }

    // Sort: updatedAt desc
    tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    return NextResponse.json({ tasks })
  } catch (err) {
    console.error('[api/kanban GET]', err)
    return NextResponse.json({ tasks: [] })
  }
}

/** POST /api/kanban — create a new task
 *
 * Writes directly to DynamoDB so that all fields (assignee, priority, etc.)
 * are persisted correctly.  Sending the same data through the Slack→Hermes
 * bridge causes the LLM to drop structured flags like --assignee, so we
 * bypass that path for creation.  The task ID format matches Hermes's own
 * convention (`t_<8 hex chars>`) so it is recognisable if Hermes ever picks
 * it up via "Launch in Chat".
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      title?:         string
      description?:   string
      assignee?:      string
      priority?:      string
      workspaceType?: string
      tenant?:        string
      tags?:          string[]
      board?:         string
    }

    const title = (body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

    const board        = body.board ?? 'default'
    const assignee     = (body.assignee      ?? 'general').trim()
    const priority     = (body.priority      ?? 'normal').trim()
    const workspace    = (body.workspaceType ?? 'scratch').trim()
    const description  = (body.description   ?? '').trim()
    const tags         = body.tags ?? []
    const now          = new Date().toISOString()

    // Generate a task ID in Hermes's format so it's cross-compatible
    const taskId = `t_${randomBytes(4).toString('hex')}`

    await ddb.send(new PutCommand({
      TableName: TABLES.kanban,
      Item: {
        pk:            `BOARD#${board}`,
        sk:            `TASK#${taskId}`,
        taskId,
        title,
        body:          description,
        status:        'triage',
        assignee,
        priority,
        workspaceType: workspace,
        tags,
        tenant:        body.tenant ?? null,
        parentIds:     [],
        childIds:      [],
        commentCount:  0,
        createdAt:     now,
        updatedAt:     now,
      },
    }))

    return NextResponse.json({ ok: true, taskId }, { status: 202 })
  } catch (err) {
    console.error('[api/kanban POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
