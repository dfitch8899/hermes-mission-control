import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { ddb, TABLES, QueryCommand, } from '@/lib/dynamodb'
import { postToSlack } from '@/lib/slack'
import type { KanbanTask, KanbanStatus } from '@/types/kanban'

const BOARD = 'BOARD#default'

/** GET /api/kanban — list all tasks, optional ?status= and ?assignee= filters */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const statusFilter   = searchParams.get('status')   as KanbanStatus | null
  const assigneeFilter = searchParams.get('assignee')

  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.kanban,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': BOARD, ':prefix': 'TASK#' },
    }))

    let tasks: KanbanTask[] = (result.Items ?? []).map(item => ({
      taskId:       item.taskId       as string,
      title:        item.title        as string,
      body:         (item.body        as string) || '',
      status:       (item.status      as KanbanStatus) || 'triage',
      assignee:     (item.assignee    as string) || 'general',
      priority:     (item.priority    as 'low' | 'normal' | 'high') || 'normal',
      tenant:       item.tenant       as string | undefined,
      workspaceType:item.workspaceType as string | undefined,
      parentIds:    (item.parentIds   as string[]) ?? [],
      childIds:     (item.childIds    as string[]) ?? [],
      commentCount: (item.commentCount as number) ?? 0,
      createdAt:    item.createdAt    as string,
      updatedAt:    item.updatedAt    as string,
      completedAt:  item.completedAt  as string | undefined,
      archivedAt:   item.archivedAt   as string | undefined,
    }))

    if (statusFilter)   tasks = tasks.filter(t => t.status   === statusFilter)
    if (assigneeFilter) tasks = tasks.filter(t => t.assignee === assigneeFilter)

    // Sort by updatedAt desc, archived last
    tasks.sort((a, b) => {
      if (a.archivedAt && !b.archivedAt) return 1
      if (!a.archivedAt && b.archivedAt) return -1
      return b.updatedAt.localeCompare(a.updatedAt)
    })

    return NextResponse.json({ tasks })
  } catch (err) {
    console.error('[api/kanban GET]', err)
    return NextResponse.json({ tasks: [] })
  }
}

/** POST /api/kanban — create a new task via /kanban create slash command */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      title?:         string
      description?:   string
      assignee?:      string
      priority?:      string
      workspaceType?: string
      tenant?:        string
    }

    const title    = (body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

    const session    = await getServerSession(authOptions)
    const senderName = session?.user?.name ?? session?.user?.email ?? ''

    const assignee      = body.assignee      ?? 'general'
    const priority      = body.priority      ?? 'normal'
    const workspace     = body.workspaceType ?? 'scratch'
    const description   = (body.description  ?? '').trim()

    // Format /kanban create command
    let cmd = `/kanban create "${title}"`
    if (assignee)    cmd += ` --assignee ${assignee}`
    if (priority && priority !== 'normal') cmd += ` --priority ${priority}`
    if (workspace && workspace !== 'scratch') cmd += ` --workspace "${workspace}"`
    if (body.tenant) cmd += ` --tenant "${body.tenant}"`
    if (description) cmd += `\n${description}`

    await postToSlack(cmd, senderName)
    return NextResponse.json({ ok: true }, { status: 202 })
  } catch (err) {
    console.error('[api/kanban POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
