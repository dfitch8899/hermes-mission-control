/**
 * POST /api/calendar/[id]/run — trigger a Hermes cron job immediately.
 * It will fire on the next scheduler tick (Hermes's `cron run` semantics).
 */
import { NextRequest, NextResponse } from 'next/server'
import { cronRun, HermesCronError } from '@/lib/hermesCron'

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await cronRun(params.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof HermesCronError ? err.message : String(err)
    console.error('[api/calendar/[id]/run] failed:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
