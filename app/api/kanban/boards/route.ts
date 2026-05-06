import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, QueryCommand, PutCommand } from '@/lib/dynamodb'
import type { KanbanBoard } from '@/types/kanban'

const BOARD_META_PK = 'BOARD_META'

// ── GET /api/kanban/boards ─────────────────────────────────────────────────
// Returns all boards, creating the default board if none exist.
export async function GET() {
  try {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLES.kanban,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': BOARD_META_PK, ':sk': 'BOARD#' },
    }))

    let boards = (res.Items ?? []).map(item => ({
      slug:      item.slug      as string,
      name:      item.name      as string,
      createdAt: item.createdAt as string,
    })) as KanbanBoard[]

    // Seed default board if none exist
    if (boards.length === 0) {
      const def: KanbanBoard = {
        slug:      'default',
        name:      'Default',
        createdAt: new Date().toISOString(),
      }
      await ddb.send(new PutCommand({
        TableName: TABLES.kanban,
        Item: { pk: BOARD_META_PK, sk: 'BOARD#default', ...def },
        ConditionExpression: 'attribute_not_exists(pk)',
      })).catch(() => {}) // ignore race condition
      boards = [def]
    }

    // Sort: default first, then alphabetical
    boards.sort((a, b) => {
      if (a.slug === 'default') return -1
      if (b.slug === 'default') return 1
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ boards })
  } catch (err) {
    console.error('[api/kanban/boards GET]', err)
    return NextResponse.json({ boards: [{ slug: 'default', name: 'Default', createdAt: new Date().toISOString() }] })
  }
}

// ── POST /api/kanban/boards ─────────────────────────────────────────────────
// Creates a new board. Body: { name: string, slug?: string }
export async function POST(req: NextRequest) {
  try {
    const body  = await req.json() as { name: string; slug?: string }
    const name  = (body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const slug  = (body.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
    const board: KanbanBoard = { slug, name, createdAt: new Date().toISOString() }

    await ddb.send(new PutCommand({
      TableName: TABLES.kanban,
      Item: { pk: BOARD_META_PK, sk: `BOARD#${slug}`, ...board },
    }))

    return NextResponse.json({ board }, { status: 201 })
  } catch (err) {
    console.error('[api/kanban/boards POST]', err)
    return NextResponse.json({ error: 'Failed to create board' }, { status: 500 })
  }
}
