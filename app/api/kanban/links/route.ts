import { NextRequest, NextResponse } from 'next/server'
import { hermesKanban } from '@/lib/hermes-kanban'

export async function POST(req: NextRequest) {
  const board = new URL(req.url).searchParams.get('board') ?? 'default'

  try {
    const body = await req.json().catch(() => ({})) as { parentId?: string; childId?: string }
    if (!body.parentId || !body.childId) {
      return NextResponse.json({ error: 'parentId and childId are required' }, { status: 400 })
    }
    const result = await hermesKanban.addLink(body.parentId, body.childId, { board })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/kanban/links POST]', err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('required') ? 400 : message.includes('requires Hermes native kanban') || message.includes('Configure HERMES_KANBAN_BRIDGE_URL') ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(req: NextRequest) {
  const searchParams = new URL(req.url).searchParams
  const board = searchParams.get('board') ?? 'default'
  const parentId = searchParams.get('parentId') ?? searchParams.get('parent_id')
  const childId = searchParams.get('childId') ?? searchParams.get('child_id')

  try {
    if (!parentId || !childId) {
      return NextResponse.json({ error: 'parentId and childId are required' }, { status: 400 })
    }
    const result = await hermesKanban.deleteLink(parentId, childId, { board })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/kanban/links DELETE]', err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('required') ? 400 : message.includes('requires Hermes native kanban') || message.includes('Configure HERMES_KANBAN_BRIDGE_URL') ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
