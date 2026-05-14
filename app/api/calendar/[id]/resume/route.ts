/**
 * POST /api/calendar/[id]/resume — resume a paused Hermes cron job.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, UpdateCommand } from '@/lib/dynamodb'
import { cronResume, HermesCronError } from '@/lib/hermesCron'

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await cronResume(params.id)
  } catch (err) {
    const msg = err instanceof HermesCronError ? err.message : String(err)
    console.error('[api/calendar/[id]/resume] failed:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLES.calendar,
      Key: { eventId: params.id },
      UpdateExpression: 'SET #s = :s',
      ExpressionAttributeNames: { '#s': 'state' },
      ExpressionAttributeValues: { ':s': 'scheduled' },
    }))
  } catch (err) {
    console.warn('[api/calendar/[id]/resume] mirror to DDB failed:', err)
  }
  return NextResponse.json({ success: true, state: 'scheduled' })
}
