/**
 * POST /api/calendar/[id]/pause — pause a Hermes cron job.
 * Mirrors the resulting state to DynamoDB.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, UpdateCommand } from '@/lib/dynamodb'
import { cronPause, HermesCronError } from '@/lib/hermesCron'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await cronPause(params.id)
  } catch (err) {
    const msg = err instanceof HermesCronError ? err.message : String(err)
    console.error('[api/calendar/[id]/pause] failed:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLES.calendar,
      Key: { eventId: params.id },
      UpdateExpression: 'SET #s = :s',
      ExpressionAttributeNames: { '#s': 'state' },
      ExpressionAttributeValues: { ':s': 'paused' },
    }))
  } catch (err) {
    console.warn('[api/calendar/[id]/pause] mirror to DDB failed (job is paused in Hermes):', err)
  }
  return NextResponse.json({ success: true, state: 'paused' })
}
