import { NextRequest, NextResponse } from 'next/server'
import type { KanbanStatus } from '@/types/kanban'
import { hermesKanban } from '@/lib/hermes-kanban'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const board = searchParams.get('board') ?? 'default'
  const status = searchParams.get('status') as KanbanStatus | null
  const assignee = searchParams.get('assignee')
  const search = searchParams.get('search')
  const includeArchived = searchParams.has('includeArchived')

  try {
    const tasks = await hermesKanban.listTasks({ board, status, assignee, search, includeArchived })
    return NextResponse.json({ tasks, backend: hermesKanban.lastBackendUsed })
  } catch (err) {
    console.error('[api/kanban GET]', err)
    return NextResponse.json({ tasks: [], error: String(err) })
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
      tenant?: string
      tags?: string[]
      board?: string
    }

    const result = await hermesKanban.createTask({
      title: body.title ?? '',
      description: body.description,
      assignee: body.assignee,
      priority: body.priority,
      workspaceType: body.workspaceType,
      tenant: body.tenant,
      tags: body.tags,
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
