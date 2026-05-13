/**
 * Calendar event = a Hermes cron job + UI metadata.
 *
 * Hermes is the source of truth (see lib/hermesCron.ts).  DynamoDB
 * (`hermes-calendar`) is a cache keyed on `hermesJobId` (== `eventId`).
 *
 * Fields owned by Hermes (re-synced via /api/calendar/sync):
 *   - hermesJobId, schedule, scheduleDisplay, prompt, skills,
 *     nextRun, lastRun, lastRunStatus, state
 *
 * Fields owned by MC (UI metadata):
 *   - title, description, createdBy, scheduledAt (record creation time),
 *     type (UI flavor: 'cron' recurring vs 'planned' one-shot)
 */
export type CalendarEventState = 'scheduled' | 'paused' | 'running' | 'completed'

export type CalendarEvent = {
  /** Canonical Hermes cron job id.  Same value lives in DynamoDB partition key. */
  eventId: string
  /** Alias kept in sync with eventId so callers can be explicit about provenance. */
  hermesJobId: string

  // ── UI metadata ─────────────────────────────────────────────────────────
  scheduledAt: string
  title: string
  /**
   * UI flavor:
   *  - 'cron'   = recurring (cron / interval schedule, repeat unset)
   *  - 'planned' = one-shot (ISO timestamp or duration schedule, repeat=1)
   */
  type: 'cron' | 'planned'
  description?: string
  createdBy: string

  // ── Hermes-owned ────────────────────────────────────────────────────────
  /** Raw schedule string as Hermes parses it. */
  schedule: string
  /** Human-readable rendering (Hermes `schedule_display` or computed). */
  scheduleDisplay?: string
  /** What the agent runs each tick. */
  prompt: string
  /** Skills loaded before the prompt runs. */
  skills?: string[]
  /** Current Hermes job state. */
  state?: CalendarEventState

  nextRun: string
  lastRun?: string
  lastRunStatus?: 'success' | 'failed' | 'running' | 'never'

  /**
   * Soft-delete marker.  When true, this row is hidden from all views and
   * sync re-attempts `cron remove` on every pass until Hermes finally lets
   * go of the job.  Survives Hermes restarts and stubborn cron-remove bugs.
   */
  tombstoned?: boolean
  tombstonedAt?: string
}
