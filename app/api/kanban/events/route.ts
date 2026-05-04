import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, QueryCommand } from '@/lib/dynamodb'
import type { KanbanEvent } from '@/types/kanban'

const BOARD            = 'BOARD#default'
const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS  = 30_000

/** GET /api/kanban/events — recent events, optional ?since=<ts> long-poll */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since') // ISO timestamp

  // If "since" provided, long-poll up to 30s for new events
  if (since) {
    const deadline = Date.now() + POLL_TIMEOUT_MS
    while (Date.now() < deadline) {
      const events = await fetchEvents(since)
      if (events.length > 0) return NextResponse.json({ events })
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }
    return NextResponse.json({ events: [] })
  }

  // No since param — return last 50 events
  const events = await fetchEvents()
  return NextResponse.json({ events })
}

async function fetchEvents(since?: string): Promise<KanbanEvent[]> {
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.kanban,
      KeyConditionExpression: since
        ? 'pk = :pk AND sk > :since'
        : 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: since
        ? { ':pk': BOARD, ':since': `EVENT#${since}` }
        : { ':pk': BOARD, ':prefix': 'EVENT#' },
      ScanIndexForward: false, // newest first
      Limit: 50,
    }))

    return (result.Items ?? []).map(item => ({
      eventId: item.eventId as string,
      taskId:  item.taskId  as string,
      kind:    item.kind    as KanbanEvent['kind'],
      actor:   (item.actor  as string) || '',
      payload: (item.payload as Record<string, unknown>) || {},
      ts:      item.ts      as string,
    }))
  } catch {
    return []
  }
}
