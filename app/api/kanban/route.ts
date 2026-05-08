import { NextRequest, NextResponse } from 'next/server'
import type { KanbanStatus } from '@/types/kanban'
import { hermesKanban } from '@/lib/hermes-kanban'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const board = searchParams.get('board') ?? 'default'
  const status = searchParams.get('status') as KanbanStatus | null
  const assignee = searchParams.get('assignee')
  const tenant = searchParams.get('tenant')
  const search = searchParams.get('search')
  const includeArchived = searchParams.has('includeArchived') || searchParams.get('include_archived') === 'true'

  try {
    const tasks = await hermesKanban.listTasks({ board, status, assignee, tenant, search, includeArchived })
    return NextResponse.json({ tasks, backend: hermesKanban.lastBackendUsed })
  } catch (err) {
    console.error('[api/kanban GET]', err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('requires Hermes native kanban') || message.includes('Configure HERMES_KANBAN_BRIDGE_URL') ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      title?: string
      description?: string
      assignee?: string
      priority?: string
      workspaceType?: string
      workspacePath?: string
      tenant?: string
      tags?: string[]
      parentIds?: string[]
      triage?: boolean
      idempotencyKey?: string
      maxRuntimeSeconds?: number
      skills?: string[]
      board?: string
    }

    const result = await hermesKanban.createTask({
      title: body.title ?? '',
      description: body.description,
      assignee: body.assignee,
      priority: body.priority,
      workspaceType: body.workspaceType,
      workspacePath: body.workspacePath,
      tenant: body.tenant,
      tags: body.tags,
      parentIds: body.parentIds,
      triage: body.triage,
      idempotencyKey: body.idempotencyKey,
      maxRuntimeSeconds: body.maxRuntimeSeconds,
      skills: body.skills,
      board: body.board,
    })
    return NextResponse.json(result, { status: 202 })
  } catch (err) {
    console.error('[api/kanban POST]', err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('required') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
