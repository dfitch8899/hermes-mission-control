import { NextResponse } from 'next/server'
import { ddb, TABLES, ScanCommand } from '@/lib/dynamodb'

export const dynamic = 'force-dynamic'

/** GET /api/agents/usage
 *
 *  Counts open kanban tasks (not archived, not done) per `assignee` (agentId).
 *  Used by the /agents page to render "N active tasks" badges on agent cards
 *  and to give a stronger confirmation prompt before deleting an agent that
 *  still owns work.
 *
 *  Implementation: a single Scan of the kanban table filtering for items
 *  whose sk begins with TASK# (excludes COMMENT# items). Fine at current
 *  scale — if the kanban table grows large, switch to a GSI on `assignee`.
 *
 *  Response shape: `{ counts: { [agentId]: number } }`
 */
export async function GET() {
  try {
    const result = await ddb.send(new ScanCommand({
      TableName: TABLES.kanban,
      FilterExpression: 'begins_with(sk, :prefix) AND attribute_not_exists(archivedAt) AND #st <> :done',
      ExpressionAttributeNames:  { '#st': 'status' },
      ExpressionAttributeValues: { ':prefix': 'TASK#', ':done': 'done' },
      ProjectionExpression: 'assignee',
    }))

    const counts: Record<string, number> = {}
    for (const item of result.Items ?? []) {
      const a = (item.assignee as string | undefined) ?? 'general'
      counts[a] = (counts[a] ?? 0) + 1
    }
    return NextResponse.json({ counts })
  } catch (err) {
    console.error('[api/agents/usage GET]', err)
    return NextResponse.json({ counts: {} })
  }
}
