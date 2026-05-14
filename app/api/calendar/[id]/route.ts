/**
 * GET    /api/calendar/[id]  — single event from DynamoDB cache.
 * PUT    /api/calendar/[id]  — edit.  Hermes-owned fields go through `cron edit`;
 *                              UI-only fields (title, description) update DynamoDB only.
 * DELETE /api/calendar/[id]  — Hermes `cron remove` + DynamoDB delete, with
 *                              a `cron pause` + tombstone fallback if Hermes
 *                              refuses to remove.
 *
 * Calendar markers (MC-only date entries, no Hermes job) are detected by
 * the `cal-*` eventId prefix — see `isCalendarMarker`.  They bypass the
 * Hermes path entirely.  Empty `prompt` is NOT a reliable marker signal:
 * `hermes cron list` doesn't print prompts, so synced Hermes rows have
 * empty prompts in DDB too.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@/lib/dynamodb'
import type { CalendarEvent } from '@/types/calendar'
import { cronEdit, cronRemove, cronPause, lastCronRemoveDiagnostic, HermesCronError } from '@/lib/hermesCron'

interface Params { params: Promise<{ id: string }> }

async function loadEvent(eventId: string): Promise<CalendarEvent | null> {
  const result = await ddb.send(new GetCommand({ TableName: TABLES.calendar, Key: { eventId } }))
  return (result.Item as CalendarEvent | undefined) ?? null
}

/**
 * A "calendar marker" is an MC-only row that has no corresponding Hermes
 * cron job (just a date entry on the calendar).  We generate marker IDs
 * with a `cal-` prefix in POST /api/calendar; Hermes job IDs are 12-char
 * hex strings.  Empty `prompt` alone is NOT enough — `hermes cron list`
 * doesn't print the prompt, so synced Hermes jobs always have prompt="" in
 * DDB until they're individually fetched.
 */
function isCalendarMarker(ev: CalendarEvent | null): boolean {
  return !!ev && typeof ev.eventId === 'string' && ev.eventId.startsWith('cal-')
}

export async function GET(_req: NextRequest, props: Params) {
  const params = await props.params;
  try {
    const event = await loadEvent(params.id)
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    return NextResponse.json({ event })
  } catch (err) {
    console.error('[api/calendar/[id] GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, props: Params) {
  const params = await props.params;
  let body: Partial<CalendarEvent> = {}
  try { body = await req.json() } catch { /* empty */ }

  const existing = await loadEvent(params.id).catch(() => null)

  // ── Calendar-marker path: DynamoDB-only edit ──────────────────────────
  if (isCalendarMarker(existing)) {
    return mirrorToDynamo(params.id, body)
  }

  // ── Hermes-owned path ─────────────────────────────────────────────────
  const hermesUpdates: Parameters<typeof cronEdit>[1] = {}
  if (body.schedule !== undefined) hermesUpdates.schedule = body.schedule
  if (body.prompt   !== undefined) hermesUpdates.prompt   = body.prompt
  if (body.title    !== undefined) hermesUpdates.name     = body.title
  if (body.skills   !== undefined) {
    hermesUpdates.skills = body.skills
    if (body.skills.length === 0) hermesUpdates.clearSkills = true
  }

  const hasHermesUpdates = Object.keys(hermesUpdates).length > 0

  if (hasHermesUpdates) {
    try {
      const updated = await cronEdit(params.id, hermesUpdates)
      const merged: Partial<CalendarEvent> = {
        ...body,
        schedule:        updated.schedule,
        scheduleDisplay: updated.scheduleDisplay ?? updated.schedule,
        // Only overwrite the stored prompt if Hermes returned a non-empty
        // value.  `cron list` strips the prompt field, so cronEdit's
        // returned `updated.prompt` is often '' even when the actual
        // prompt is intact — writing empty back would clobber the cache.
        ...(updated.prompt ? { prompt: updated.prompt } : {}),
        // Pass skills through as the actual array (incl. empty) so clears
        // propagate to DDB.  Undefined would be skipped by UpdateCommand
        // and the stale skills value would persist.
        skills:          updated.skills,
        state:           updated.state,
        nextRun:         updated.nextRunAt ?? body.nextRun ?? existing?.nextRun,
      }
      return mirrorToDynamo(params.id, merged)
    } catch (err) {
      const msg = err instanceof HermesCronError ? err.message : String(err)
      console.error('[api/calendar/[id] PUT] Hermes cron edit failed:', msg)
      return NextResponse.json({ error: `Hermes cron edit failed: ${msg}` }, { status: 502 })
    }
  }

  // UI-only updates (description, createdBy, etc.).
  return mirrorToDynamo(params.id, body)
}

async function mirrorToDynamo(eventId: string, body: Partial<CalendarEvent>) {
  const fields = { ...body }
  delete fields.eventId

  const updateExpressions: string[] = []
  const ean: Record<string, string> = {}
  const eav: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    updateExpressions.push(`#${key} = :${key}`)
    ean[`#${key}`] = key
    eav[`:${key}`] = value
  }

  if (updateExpressions.length === 0) {
    const fresh = await loadEvent(eventId).catch(() => null)
    return NextResponse.json({ event: fresh })
  }

  try {
    const result = await ddb.send(new UpdateCommand({
      TableName: TABLES.calendar,
      Key: { eventId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: ean,
      ExpressionAttributeValues: eav,
      ReturnValues: 'ALL_NEW',
    }))
    return NextResponse.json({ event: result.Attributes })
  } catch (err) {
    // If the row doesn't exist yet (Hermes-created from terminal, never seen
    // by MC), upsert the merged shape with a Put.
    console.warn('[api/calendar/[id] PUT] Update failed, attempting upsert:', err)
    try {
      await ddb.send(new PutCommand({
        TableName: TABLES.calendar,
        Item: { eventId, ...fields },
      }))
      return NextResponse.json({ event: { eventId, ...fields } })
    } catch (putErr) {
      console.error('[api/calendar/[id] PUT] upsert failed:', putErr)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}

export async function DELETE(_req: NextRequest, props: Params) {
  const params = await props.params;
  const id = params.id
  console.log(`[DELETE /api/calendar/${id}] start`)

  // Global guard — anything uncaught becomes a structured 500 instead of
  // an empty-body crash.
  try {
    const existing = await loadEvent(id).catch((err) => {
      console.warn(`[DELETE /api/calendar/${id}] loadEvent threw:`, err)
      return null
    })
    console.log(`[DELETE /api/calendar/${id}] existing=${existing ? `prompt="${(existing.prompt ?? '').slice(0, 40)}" tombstoned=${existing.tombstoned ?? false}` : 'null'}`)

    // Calendar marker (MC-only, no Hermes job).
    if (isCalendarMarker(existing)) {
      try {
        await ddb.send(new DeleteCommand({ TableName: TABLES.calendar, Key: { eventId: id } }))
        return NextResponse.json({ success: true, _path: 'marker' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[DELETE /api/calendar/${id}] marker DDB delete failed:`, msg)
        return NextResponse.json({ error: `DynamoDB delete failed: ${msg}`, _path: 'marker' }, { status: 502 })
      }
    }

    // ── Real cron job — three-tier delete ────────────────────────────────
    let removed = false
    let removeErr: string | null = null
    try {
      await cronRemove(id)
      removed = true
      console.log(`[DELETE /api/calendar/${id}] cronRemove SUCCEEDED`)
    } catch (err) {
      removeErr = err instanceof HermesCronError ? err.message : String(err)
      console.error(`[DELETE /api/calendar/${id}] cronRemove FAILED:`, removeErr)
    }

    const diag = lastCronRemoveDiagnostic()

    if (removed) {
      try {
        await ddb.send(new DeleteCommand({ TableName: TABLES.calendar, Key: { eventId: id } }))
        return NextResponse.json({ success: true, _path: 'removed', _diagnostic: diag })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[DELETE /api/calendar/${id}] post-remove DDB delete failed:`, msg)
        // Hermes already let go, so this is just a DDB cleanup — next sync
        // will catch it as an orphan and clean up.  Return success so the
        // user isn't blocked.
        return NextResponse.json({
          success: true,
          _path: 'removed-ddb-orphan',
          _warning: `Hermes removed the job but DynamoDB cleanup failed: ${msg}. Sync will clean up the row next pass.`,
          _diagnostic: diag,
        })
      }
    }

    // Tier 2: pause as fallback so the job can't fire.
    let paused = false
    let pauseErr: string | null = null
    try {
      await cronPause(id)
      paused = true
      console.warn(`[DELETE /api/calendar/${id}] cronPause succeeded — job paused, won't fire`)
    } catch (err) {
      pauseErr = err instanceof HermesCronError ? err.message : String(err)
      console.error(`[DELETE /api/calendar/${id}] cronPause FAILED:`, pauseErr)
    }

    if (!paused) {
      return NextResponse.json(
        {
          error: `Could not delete or pause job in Hermes — it may still fire on schedule. ` +
                 `remove: ${removeErr}; pause: ${pauseErr}`,
          _path: 'tier3-failure',
          _diagnostic: diag,
        },
        { status: 502 },
      )
    }

    // Pause succeeded — tombstone (upsert) the DDB row so the UI hides it.
    // Use PutCommand with the row we know about, fall back to UpdateCommand
    // if the row doesn't exist yet (Hermes-created via terminal).
    try {
      if (existing) {
        const tombstoned: CalendarEvent = {
          ...existing,
          tombstoned: true,
          tombstonedAt: new Date().toISOString(),
          state: 'paused',
        }
        await ddb.send(new PutCommand({ TableName: TABLES.calendar, Item: tombstoned }))
      } else {
        // No existing row — create a tombstone marker so sync filters this id
        // out until Hermes lets go.
        const tombstone: CalendarEvent = {
          eventId: id,
          hermesJobId: id,
          scheduledAt: new Date().toISOString(),
          title: '(tombstoned)',
          type: 'cron',
          createdBy: 'system',
          schedule: '',
          prompt: '(tombstoned)',
          state: 'paused',
          nextRun: new Date().toISOString(),
          tombstoned: true,
          tombstonedAt: new Date().toISOString(),
        }
        await ddb.send(new PutCommand({ TableName: TABLES.calendar, Item: tombstone }))
      }
      return NextResponse.json({
        success: true,
        _path: 'paused-tombstoned',
        _tombstoned: true,
        _pausedFallback: true,
        _hermesError: removeErr,
        _diagnostic: diag,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[DELETE /api/calendar/${id}] tombstone write failed:`, msg)
      return NextResponse.json(
        {
          error: `Hermes cron remove failed AND DDB tombstone failed: ${removeErr}; ${msg}. ` +
                 `Job has been PAUSED in Hermes so it won't fire, but its row may still appear in the UI.`,
          _path: 'tombstone-write-failed',
          _diagnostic: diag,
        },
        { status: 502 },
      )
    }
  } catch (err) {
    // Catchall — anything that escaped our try/catches becomes a structured
    // response so the UI never sees an empty 500 body.
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error(`[DELETE /api/calendar/${id}] UNCAUGHT:`, msg, stack)
    // Stack trace only in development — production would leak internal paths
    // and library implementation detail to whoever can reach the route.
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      {
        error: `Unhandled server error: ${msg}`,
        ...(isDev && stack ? { _stack: stack.split('\n').slice(0, 5).join('\n') } : {}),
      },
      { status: 500 },
    )
  }
}
