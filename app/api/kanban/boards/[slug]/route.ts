import { NextRequest, NextResponse } from 'next/server'
import { hermesKanban } from '@/lib/hermes-kanban'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const result = await hermesKanban.deleteBoard(params.slug)
    return NextResponse.json(result)
  } catch (err) {
    console.error(`[api/kanban/boards/${params.slug} DELETE]`, err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('default board') ? 400 : message.includes('does not exist') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
