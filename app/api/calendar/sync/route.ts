/**
 * POST /api/calendar/sync — reconcile DynamoDB cache with Hermes cron list.
 *
 * Pipeline:
 *   1. Pull live job list from Hermes (`cron list --all`).
 *   2. Pull current DDB rows.
 *   3. For each Hermes job whose DDB row is tombstoned → retry `cron remove`.
 *      - If Hermes finally lets go: delete the DDB row.
 *      - If still stuck: keep the tombstone, do not return it to the UI.
 *   4. For each remaining Hermes job → upsert DDB and return.
 *   5. For DDB orphans (in DDB but not in Hermes):
 *      - Calendar markers (eventId starts with `cal-`): keep.
 *      - Tombstoned rows: delete (Hermes already let go).
 *      - Otherwise: delete (stale Hermes-backed row).
 */
import { NextResponse } from 'next/server'
import { ddb, TABLES, ScanCommand, PutCommand, DeleteCommand } from '@/lib/dynamodb'
import type { CalendarEvent } from '@/types/calendar'
import { cronList, cronRemove, HermesCronError, type HermesCronJob } from '@/lib/hermesCron'

function hermesJobToEvent(job: HermesCronJob, existing?: CalendarEvent): CalendarEvent {
  const now = new Date().toISOString()
  return {
    eventId:         job.jobId,
    hermesJobId:     job.jobId,
    scheduledAt:     existing?.scheduledAt ?? now,
    title:           existing?.title ?? job.name ?? 'Untitled',
    type:            existing?.type ?? (job.repeat === 'once' || job.repeat === '1/1' ? 'planned' : 'cron'),
    description:     existing?.description,
    createdBy:       existing?.createdBy ?? 'hermes',
    schedule:        job.schedule,
    scheduleDisplay: job.scheduleDisplay ?? job.schedule,
    prompt:          job.prompt || existing?.prompt || '',
    skills:          job.skills.length ? job.skills : undefined,
    state:           job.state,
    nextRun:         job.nextRunAt ?? existing?.nextRun ?? now,
    lastRun:         job.lastRunAt ?? existing?.lastRun,
    lastRunStatus:   job.lastStatus ?? existing?.lastRunStatus ?? 'never',
  }
}

export async function POST() {
  // 1. Pull from Hermes.
  let hermesJobs: HermesCronJob[]
  try {
    hermesJobs = await cronList(true)
  } catch (err) {
    const msg = err instanceof HermesCronError ? err.message : String(err)
    console.error('[api/calendar/sync] cronList failed:', msg)
    return NextResponse.json({ error: `Hermes cron list failed: ${msg}` }, { status: 502 })
  }

  // 2. Pull current DDB rows.
  let ddbRows: CalendarEvent[] = []
  try {
    const res = await ddb.send(new ScanCommand({ TableName: TABLES.calendar }))
    ddbRows = (res.Items as CalendarEvent[] | undefined) ?? []
  } catch (err) {
    console.warn('[api/calendar/sync] DynamoDB scan failed, proceeding with empty cache:', err)
  }

  const ddbById = new Map<string, CalendarEvent>(ddbRows.map(r => [r.eventId, r]))
  const hermesIds = new Set(hermesJobs.map(j => j.jobId))

  // 3 + 4: process Hermes jobs.
  const merged: CalendarEvent[] = []
  const retriedThisPass: string[] = []
  for (const job of hermesJobs) {
    const existing = ddbById.get(job.jobId)

    // Tombstoned → retry remove, hide from UI.
    if (existing?.tombstoned) {
      retriedThisPass.push(job.jobId)
      try {
        await cronRemove(job.jobId)
        // Hermes finally let go → clean up the tombstone too.
        await ddb.send(new DeleteCommand({ TableName: TABLES.calendar, Key: { eventId: job.jobId } }))
        console.log(`[api/calendar/sync] tombstoned job ${job.jobId} finally removed from Hermes`)
      } catch (err) {
        // Still stuck — keep the tombstone, leave row in DDB.
        console.warn(`[api/calendar/sync] retry remove failed for tombstoned ${job.jobId}:`, err instanceof Error ? err.message : err)
      }
      continue  // never return tombstoned rows to UI
    }

    const event = hermesJobToEvent(job, existing)
    merged.push(event)
    try {
      await ddb.send(new PutCommand({ TableName: TABLES.calendar, Item: event }))
    } catch (err) {
      console.warn(`[api/calendar/sync] upsert ${job.jobId} failed:`, err)
    }
  }

  // 5. DDB orphans.
  for (const row of ddbRows) {
    if (hermesIds.has(row.eventId)) continue

    // Tombstoned row whose Hermes counterpart is already gone — clean up.
    if (row.tombstoned) {
      try {
        await ddb.send(new DeleteCommand({ TableName: TABLES.calendar, Key: { eventId: row.eventId } }))
      } catch (err) {
        console.warn(`[api/calendar/sync] delete orphan tombstone ${row.eventId} failed:`, err)
      }
      continue
    }

    // Calendar marker (MC-owned date entry, no Hermes job).  IDs we mint
    // for markers start with `cal-`; Hermes IDs are 12-char hex.
    if (row.eventId?.startsWith('cal-')) {
      merged.push(row)
      continue
    }

    // Hermes-backed row that disappeared from Hermes — drop.
    try {
      await ddb.send(new DeleteCommand({ TableName: TABLES.calendar, Key: { eventId: row.eventId } }))
    } catch (err) {
      console.warn(`[api/calendar/sync] delete orphan ${row.eventId} failed:`, err)
    }
  }

  return NextResponse.json({
    events: merged,
    syncedAt: new Date().toISOString(),
    ...(retriedThisPass.length > 0 ? { _tombstoneRetries: retriedThisPass } : {}),
  })
}
