import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, QueryCommand } from '@/lib/dynamodb'
import { hermesClient } from '@/lib/hermesClient'
import type { KanbanTask, KanbanStatus } from '@/types/kanban'

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
 * Routes through the Hermes plugin API (`POST /api/plugins/kanban/tasks`)
 * so Hermes is the source of truth. The plugin assigns the task id and
 * `kanban_mirror.py` echoes the new row back into DynamoDB within its
 * poll window — MC's read path picks it up on the next GET /api/kanban.
 *
 * Previously this route wrote directly to DDB, which left Hermes unaware
 * of MC-created tasks. The native triage behavior (e.g. `/tasks/:id/specify`
 * auto-promotion) never fired, so cards in triage went nowhere.
 *
 * Requires HERMES_TRANSPORT=direct; the direct-only-strict wrapper in
 * hermesClient.ts surfaces a clear error instead of silently dropping
 * the task if the dashboard transport is unreachable.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      title?:         string
      description?:   string
      assignee?:      string
      priority?:      'low' | 'normal' | 'high' | 'critical'
      workspaceType?: string
      tenant?:        string
      tags?:          string[]
      board?:         string
    }

    const title = (body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

    const taskId = await hermesClient.kanbanCreate({
      title,
      description:   body.description?.trim(),
      assignee:      body.assignee?.trim() || 'general',
      priority:      body.priority ?? 'normal',
      workspaceType: body.workspaceType?.trim() || 'scratch',
      tenant:        body.tenant ?? undefined,
      board:         body.board ?? undefined,
      // Land MC-created tasks in the triage column — same semantics as
      // before. From there the Hermes auxiliary LLM can promote via
      // /api/plugins/kanban/tasks/:id/specify, or a human drags them out.
      triage:        true,
    })

    return NextResponse.json({ ok: true, taskId }, { status: 202 })
  } catch (err) {
    console.error('[api/kanban POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
