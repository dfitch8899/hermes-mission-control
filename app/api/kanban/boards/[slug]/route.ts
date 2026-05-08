import { NextRequest, NextResponse } from 'next/server'
import { hermesKanban } from '@/lib/hermes-kanban'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const body = await req.json().catch(() => ({})) as { name?: string; description?: string; icon?: string; color?: string }
    const result = await hermesKanban.updateBoard(params.slug, body)
    return NextResponse.json(result)
  } catch (err) {
    console.error(`[api/kanban/boards/${params.slug} PATCH]`, err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('native-only') || message.includes('requires Hermes native kanban') || message.includes('Configure HERMES_KANBAN_BRIDGE_URL') ? 503 : message.includes('does not exist') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const hardDelete = new URL(req.url).searchParams.get('delete') === 'true'
    const result = await hermesKanban.deleteBoard(params.slug, { hardDelete })
    return NextResponse.json(result)
  } catch (err) {
    console.error(`[api/kanban/boards/${params.slug} DELETE]`, err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('default board') ? 400 : message.includes('does not exist') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
