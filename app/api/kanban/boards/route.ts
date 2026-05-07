import { NextRequest, NextResponse } from 'next/server'
import { hermesKanban } from '@/lib/hermes-kanban'

export async function GET() {
  try {
    const boards = await hermesKanban.listBoards()
    return NextResponse.json({ boards, backend: hermesKanban.lastBackendUsed })
  } catch (err) {
    console.error('[api/kanban/boards GET]', err)
    return NextResponse.json({ boards: [{ slug: 'default', name: 'Default', createdAt: new Date().toISOString() }], error: String(err) })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { name?: string; slug?: string }
    const result = await hermesKanban.createBoard({
      name: body.name ?? '',
      slug: body.slug,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[api/kanban/boards POST]', err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('required') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
