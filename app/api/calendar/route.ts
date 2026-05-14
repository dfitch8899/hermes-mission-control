/**
 * GET  /api/calendar       — read DynamoDB cache (fast).
 * POST /api/calendar       — create.  Hermes is the source of truth for
 *                            type='cron' jobs; the DynamoDB write is a cache
 *                            mirror of what Hermes returned.
 *
 * type='planned' events:
 *   - If `prompt` is provided, registered with Hermes as a one-shot
 *     (`--repeat 1`, schedule = ISO timestamp from `scheduledAt`).
 *   - Otherwise stored only in DynamoDB as a calendar marker.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, PutCommand, ScanCommand } from '@/lib/dynamodb'
import type { CalendarEvent } from '@/types/calendar'
import { cronAdd, HermesCronError, type HermesCronJob } from '@/lib/hermesCron'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  try {
    const filterExpressions: string[] = []
    const expressionAttributeValues: Record<string, unknown> = {}
    const expressionAttributeNames: Record<string, string> = {}

    if (type) {
      filterExpressions.push('#t = :type')
      expressionAttributeNames['#t'] = 'type'
      expressionAttributeValues[':type'] = type
    }

    const cmd = new ScanCommand({
      TableName: TABLES.calendar,
      ...(filterExpressions.length > 0 && {
        FilterExpression: filterExpressions.join(' AND '),
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
      }),
    })

    const result = await ddb.send(cmd)
    const items = ((result.Items as CalendarEvent[] | undefined) ?? []).filter(e => !e.tombstoned)
    return NextResponse.json({ events: items })
  } catch (err) {
    console.error('[api/calendar GET]', err)
    return NextResponse.json({ events: [], error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}

function toCalendarEvent(
  job: HermesCronJob,
  ui: { type: 'cron' | 'planned'; title: string; description?: string; createdBy: string; scheduledAt: string },
): CalendarEvent {
  return {
    eventId:         job.jobId,
    hermesJobId:     job.jobId,
    scheduledAt:     ui.scheduledAt,
    title:           ui.title,
    type:            ui.type,
    description:     ui.description,
    createdBy:       ui.createdBy,
    schedule:        job.schedule,
    scheduleDisplay: job.scheduleDisplay ?? job.schedule,
    prompt:          job.prompt,
    skills:          job.skills.length ? job.skills : undefined,
    state:           job.state,
    nextRun:         job.nextRunAt ?? ui.scheduledAt,
    lastRun:         job.lastRunAt,
    lastRunStatus:   job.lastStatus ?? 'never',
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* tolerate empty body */ }

  const type: 'cron' | 'planned' = body.type === 'cron' ? 'cron' : 'planned'
  const title       = String(body.title ?? 'Untitled Event').slice(0, 200)
  const description = body.description ? String(body.description) : undefined
  const createdBy   = String(body.createdBy ?? 'user')
  const prompt      = body.prompt ? String(body.prompt) : ''
  const skills      = Array.isArray(body.skills)
    ? (body.skills as unknown[]).map(s => String(s).trim()).filter(Boolean)
    : undefined
  const scheduledAt = String(body.scheduledAt ?? new Date().toISOString())

  // Determine the Hermes schedule string.
  // For 'cron': use `body.schedule` verbatim (cron / "every Xm" / etc.).
  // For 'planned' with prompt: use the ISO timestamp.
  // For 'planned' without prompt: store as DynamoDB-only calendar marker.
  const schedule = type === 'cron'
    ? String(body.schedule ?? body.cronExpression ?? '')
    : scheduledAt

  // Cron jobs require a prompt — Hermes won't accept an empty add.
  if (type === 'cron' && !prompt.trim()) {
    return NextResponse.json({ error: 'prompt is required for cron events' }, { status: 400 })
  }
  if (type === 'cron' && !schedule.trim()) {
    return NextResponse.json({ error: 'schedule is required for cron events' }, { status: 400 })
  }

  const usesHermes = type === 'cron' || (type === 'planned' && !!prompt.trim())

  if (usesHermes) {
    try {
      const job = await cronAdd({
        schedule,
        prompt,
        name: title,
        skills,
        repeat: type === 'planned' ? 1 : undefined,
      })
      const event = toCalendarEvent(job, { type, title, description, createdBy, scheduledAt })

      try {
        await ddb.send(new PutCommand({ TableName: TABLES.calendar, Item: event }))
      } catch (ddbErr) {
        console.error('[api/calendar POST] DynamoDB mirror failed:', ddbErr)
        // Hermes job exists; return the event without DDB mirror.
      }
      return NextResponse.json({ event }, { status: 201 })
    } catch (err) {
      const msg = err instanceof HermesCronError ? err.message : String(err)
      console.error('[api/calendar POST] Hermes cron add failed:', msg)
      return NextResponse.json({ error: `Hermes cron add failed: ${msg}` }, { status: 502 })
    }
  }

  // ── Calendar-only path (planned event, no prompt) ──────────────────────
  const localId = `cal-${crypto.randomUUID().slice(0, 12)}`
  const event: CalendarEvent = {
    eventId: localId,
    hermesJobId: localId,
    scheduledAt,
    title,
    type,
    description,
    createdBy,
    schedule: scheduledAt,
    scheduleDisplay: 'calendar marker',
    prompt: '',
    state: 'scheduled',
    nextRun: scheduledAt,
    lastRunStatus: 'never',
  }
  try {
    await ddb.send(new PutCommand({ TableName: TABLES.calendar, Item: event }))
    return NextResponse.json({ event }, { status: 201 })
  } catch (err) {
    console.error('[api/calendar POST] DynamoDB write failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
