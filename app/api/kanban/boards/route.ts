import { NextRequest, NextResponse } from 'next/server'
import { hermesKanban } from '@/lib/hermes-kanban'

export async function GET(req: NextRequest) {
  try {
    const includeArchived = new URL(req.url).searchParams.get('include_archived') === 'true'
    const boards = await hermesKanban.listBoards(includeArchived)
    return NextResponse.json({ boards, backend: hermesKanban.lastBackendUsed })
  } catch (err) {
    console.error('[api/kanban/boards GET]', err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('native-only') || message.includes('requires Hermes native kanban') || message.includes('Configure HERMES_KANBAN_BRIDGE_URL') ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { name?: string; slug?: string; description?: string; icon?: string; color?: string; switchToBoard?: boolean }
    const result = await hermesKanban.createBoard({
      name: body.name ?? '',
      slug: body.slug,
      description: body.description,
      icon: body.icon,
      color: body.color,
      switchToBoard: body.switchToBoard,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[api/kanban/boards POST]', err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('required') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
