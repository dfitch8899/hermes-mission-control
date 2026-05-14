# Calendar / Cron Feature — Review (Iter 1)

**Reviewed:** 2026-05-14
**Depth:** standard
**Scope:** `app/calendar/page.tsx`, `components/calendar/**`, `types/calendar.ts`, `app/api/calendar/**`
**Out of scope:** `lib/hermesCron.ts` (reviewed elsewhere)

Overall the surface is well-structured and defensive — DELETE has thoughtful tiered fallbacks, sync is idempotent, the marker/Hermes-job distinction is documented inline, and there is no obvious injection or auth-bypass. The findings below are mostly correctness/quality nits plus one real bug (double-sync on mount) and one moderately serious UX issue (no-op sync POST request burst on focus thrash).

Note on scope: the user listed `lib/describeSchedule.ts`. That path does not exist in the repo; the actual file is `components/calendar/describeSchedule.ts` and is reviewed under that path below.

---

## CRITICAL

No issues found.

---

## HIGH

### H1. Double sync on mount due to dev StrictMode + visibilitychange listener pattern
**File:** `app/calendar/page.tsx:50-61`
**Risk:** AUTO-SAFE

```ts
useEffect(() => {
  void sync()                                  // fires once per mount
  const onVisible = () => {
    if (document.visibilityState === 'visible') void sync()
  }
  window.addEventListener('focus', onVisible)
  document.addEventListener('visibilitychange', onVisible)
  return () => { ... }
}, [sync])
```

Two real problems:

1. **StrictMode double-invoke in dev** runs the effect twice → two `sync()` calls (~2s each, per problem statement). The cleanup doesn't help because there's no in-flight cancellation/dedupe.
2. **`focus` + `visibilitychange` fire together** on tab/window return — every refocus does *two* syncs, not one.

**Recommended fix (no behavior change in prod, eliminates the storm):** dedupe in-flight syncs and consolidate listeners.

```ts
const inFlight = useRef<Promise<void> | null>(null)
const sync = useCallback(async () => {
  if (inFlight.current) return inFlight.current
  setSyncing(true); setPageError(null)
  const p = (async () => {
    try { /* ...existing fetch logic... */ }
    finally { setSyncing(false); inFlight.current = null }
  })()
  inFlight.current = p
  return p
}, [])

useEffect(() => {
  void sync()
  const onVisible = () => {
    if (document.visibilityState === 'visible') void sync()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}, [sync])
```

`visibilitychange` already covers tab refocus on all modern browsers — dropping the redundant `focus` listener removes one duplicate; the `inFlight` ref kills the StrictMode duplicate and any rapid user-driven duplicates. Combined effect: 4 syncs/page-load → 1.

---

### H2. `ScanCommand` on `hermes-calendar` will not scale and silently drops rows past 1 MB
**File:** `app/api/calendar/route.ts:32-42`, `app/api/calendar/sync/route.ts:56`
**Risk:** FLAGGED (touches data-access pattern; doesn't touch hermes/auth/AWS SDK semantics but worth a deliberate call)

`new ScanCommand({ TableName: TABLES.calendar })` returns a single page. DynamoDB Scan caps at 1 MB; once the user has more than a few hundred cron jobs, the GET endpoint and the sync endpoint will silently truncate and show inconsistent state (orphan-cleanup pass in sync will then *delete* the rows that didn't fit on this page, because they appear "missing from DDB").

Per the project's "performance out of scope" note this isn't a perf finding — it's a **correctness** finding: pagination is required for the orphan-detection logic to be safe at any non-trivial table size.

**Recommended fix:** wrap scans in a paginator.

```ts
async function scanAll<T>(params: ScanCommandInput): Promise<T[]> {
  const out: T[] = []
  let ExclusiveStartKey: Record<string, unknown> | undefined
  do {
    const r = await ddb.send(new ScanCommand({ ...params, ExclusiveStartKey }))
    if (r.Items) out.push(...(r.Items as T[]))
    ExclusiveStartKey = r.LastEvaluatedKey
  } while (ExclusiveStartKey)
  return out
}
```

Use it in both GET and sync. The sync orphan-delete branch (`route.ts:96-122`) is the dangerous one — without pagination it can wipe valid rows.

---

### H3. Optimistic state update races a slower full sync and can flicker UI back
**File:** `app/calendar/page.tsx:101-120`, `app/calendar/page.tsx:84-99`

**Risk:** AUTO-SAFE

```ts
if (optimistic) {
  setEvents(prev => prev.map(p => p.eventId === evt.eventId ? { ...p, ...optimistic } : p))
}
void sync()
```

`callAction` (pause/resume) applies the optimistic state, then kicks off `sync()`. But `cronPause` mirrors to DDB *after* the Hermes call; if `sync()`'s `cronList` resolves before the pause mirror lands in DDB (or before Hermes's own state propagates), the merge in `hermesJobToEvent` will overwrite `state: 'paused'` with the stale `'scheduled'` from Hermes — UI flickers paused → scheduled → paused.

Bigger concern: same race exists for `handleAddEvent` and `handleEditSave`, where the POST/PUT response is merged into state and then `sync()` is fired-and-forgotten. If sync's `ScanCommand` started before the PUT's UpdateCommand committed (eventual consistency on DDB scans), the just-edited row gets clobbered.

**Recommended fix:** either (a) skip the post-mutation `sync()` entirely (the API response is already authoritative), or (b) chain it (`await sync()`) so the user-visible state lands in one transition. Option (a) is cleaner and removes another 2s round-trip per action.

---

## MEDIUM

### M1. `mirrorToDynamo` writes attributes verbatim — `tombstoned`, `eventId` (sometimes), and other reserved-word collisions
**File:** `app/api/calendar/[id]/route.ts:104-148`

**Risk:** AUTO-SAFE

```ts
for (const [key, value] of Object.entries(fields)) {
  if (value === undefined) continue
  updateExpressions.push(`#${key} = :${key}`)
  ean[`#${key}`] = key
  eav[`:${key}`] = value
}
```

The code correctly aliases every attribute name (`#key`), which sidesteps DynamoDB reserved-word collisions — good. But there are two latent issues:

1. **`null` is preserved**, while DynamoDB treats `null` and `undefined` differently. A PUT body containing `{ description: null }` will write a NULL attribute, then subsequent merges (e.g. `existing?.description` in sync) carry a `null` instead of `undefined`. Filter for `value === undefined || value === null` if "clear field" semantics are not desired.
2. **`fields.eventId` is deleted (good)** but `hermesJobId` is not — a malicious or buggy client `PUT { hermesJobId: "different-id" }` will write a mismatched alias into DDB.

**Fix:**

```ts
delete fields.eventId
delete fields.hermesJobId
delete fields.tombstoned      // never accept these from caller
delete fields.tombstonedAt
```

---

### M2. `lastRunStatus` type in `types/calendar.ts` is out of sync with how it's used
**File:** `types/calendar.ts:49`, `app/api/calendar/route.ts:69`, `app/api/calendar/sync/route.ts:38`

**Risk:** AUTO-SAFE

```ts
lastRunStatus?: 'success' | 'failed' | 'running' | 'never'
```

The literal `'never'` is treated as a value, but in `toCalendarEvent` and `hermesJobToEvent` it's used as a *sentinel* when `lastStatus` is missing:

```ts
lastRunStatus: job.lastStatus ?? 'never',
```

This is a footgun: downstream code (`EventList.tsx:19-25`) checks `if (!status || status === 'never')` — which works only because the type accidentally includes `'never'`. If Hermes ever returns the string `'never'` for a real status it would be indistinguishable from "we have no data". Either rename to `'unrun'`/`'pending'` to make intent explicit, or drop the value from the type and store `undefined` when there is no run yet.

---

### M3. `CountdownTimer` is computed at render time and never re-renders
**File:** `components/calendar/EventList.tsx:27-31`

**Risk:** AUTO-SAFE

```ts
function CountdownTimer({ nextRun }: { nextRun: string }) {
  const diff = new Date(nextRun).getTime() - Date.now()
  if (diff <= 0) return <span style={{ color: '#ffb4ab' }}>Overdue</span>
  return <span>{formatDistanceToNow(new Date(nextRun))}</span>
}
```

The component is named "Timer" but is a pure render — it computes `diff` once when the parent re-renders. A job whose `nextRun` was 1 minute away will read "in 1 minute" indefinitely until the user triggers a refocus/sync. Not a bug per se, but the name and visual ("Overdue" in red) imply live-updating.

**Fix:** either rename to `<NextRunLabel>`, or add a `useEffect(() => { const t = setInterval(force, 30_000); return () => clearInterval(t) }, [])`.

---

### M4. `loadEvent` failure during DELETE silently degrades the tombstone path
**File:** `app/api/calendar/[id]/route.ts:158-161`, `:236-263`

**Risk:** FLAGGED (DELETE path touches Hermes cron logic — be careful with any structural change)

```ts
const existing = await loadEvent(id).catch((err) => {
  console.warn(`[DELETE /api/calendar/${id}] loadEvent threw:`, err)
  return null
})
```

If `loadEvent` throws (DDB outage), `existing` is `null`. The marker-check then evaluates `false`, so we proceed to the cron path. If both `cronRemove` AND `cronPause` fail, the catchall returns 502. *But* if `cronRemove` fails and `cronPause` succeeds, the code enters the tombstone branch with `existing === null` and writes a synthetic tombstone row (`title: '(tombstoned)'`, `prompt: '(tombstoned)'`). On the next sync, that row will be returned to the UI under that bogus title until Hermes lets go.

**Fix:** when `existing === null` but a DDB lookup *threw* (vs. genuinely missing), retry the load once before writing the synthetic tombstone, and preserve the real title if recovery succeeds. Cheap version: don't synthesize a fake title — leave it blank and let the next sync pull the real one from `cronList`.

---

### M5. `handleAddEvent` and `handleEditSave` errors are thrown but never caught at the form layer for the listing flicker case
**File:** `app/calendar/page.tsx:67-99`

**Risk:** AUTO-SAFE

`handleAddEvent` throws on failure. `AddEventForm.handleSubmit` (line 48) catches it and shows `error`. Same for `EditEventModal`. **However**, on success, `void sync()` is fired and not awaited — so the modal closes (`onClose()` in form) and the page-level `setEvents` from the response is shown, then ~2s later the sync overwrites everything. If the sync fails (Hermes hiccup), `pageError` is set on the parent and the user just edited an event and is now staring at a red banner saying "Sync failed" with no indication the edit actually succeeded.

**Fix:** suppress page-level `pageError` updates from background syncs that were kicked off by a successful mutation. Easiest: don't auto-sync after mutations at all (the response payload is authoritative), or set a separate `backgroundSyncError` state that renders less prominently.

---

## LOW

### L1. `parseDurationMinutes` assumes regex group is non-empty
**File:** `components/calendar/describeSchedule.ts:17-24`

**Risk:** AUTO-SAFE

```ts
const m = s.trim().match(DURATION_RE)
if (!m) return null
const value = parseInt(m[1], 10)
const unit = m[2][0].toLowerCase()
```

With `DURATION_RE` requiring `\d+` and a unit, `m[1]` and `m[2]` are always defined when `m` matches — so safe. But in strict TS this should still be guarded for clarity: `m[2]?.[0]`. Minor; pure style.

---

### L2. `describeCronField` falls through to a raw cron echo for valid expressions it doesn't recognize
**File:** `components/calendar/describeSchedule.ts:32-52`

**Risk:** AUTO-SAFE

```ts
return `${min} ${hour} ${dom} ${month} ${dow}`
```

A user typing `0 9 1 * *` (1st of every month at 09:00) gets `0 9 1 * *` echoed back as the "human description", which is identical to the cron syntax line above it and therefore useless. Either:
- Return `''` for unrecognized shapes so the preview line disappears, or
- Add a few more cases (DOM-only, month-only).

Returning `''` is the least-bad short-term fix.

---

### L3. `console.log` left in production code path
**File:** `app/calendar/page.tsx:135`, `app/api/calendar/[id]/route.ts:153,162,182,185,215,218,290`, `app/api/calendar/sync/route.ts:78`

**Risk:** AUTO-SAFE

```ts
console.log(`[calendar.delete] status=${res.status} body=${JSON.stringify(body, null, 2)}`)
```

These are intentional structured logs for a recently-debugged feature ("real Hermes cron"), but several of them dump full response bodies / stack snippets to the browser console on every delete. Once the feature stabilises, downgrade body-dumps to `console.debug` (which prod can filter) or gate behind `if (process.env.NODE_ENV !== 'production')`.

---

### L4. `_path` / `_stack` / `_diagnostic` / `_warning` etc. leak internal server diagnostics in JSON responses
**File:** `app/api/calendar/[id]/route.ts:168,172,193,201-204,222-228,264-271,275-281,291-293`

**Risk:** AUTO-SAFE

Returning fields like `_stack: stack?.split('\n').slice(0, 5).join('\n')` directly to the client is fine for an internal tool, but worth a deliberate decision: the API responses leak first-5 lines of server stack traces. If this app is ever exposed outside the team, strip the underscore-prefixed fields in prod.

```ts
const debug = process.env.NODE_ENV !== 'production'
return NextResponse.json({
  error: msg,
  ...(debug ? { _stack: stack?.split('\n').slice(0, 5).join('\n') } : {}),
}, { status: 500 })
```

---

### L5. Random ID for calendar markers uses `Math.random()` not `crypto.randomUUID()`
**File:** `app/api/calendar/route.ts:131`

**Risk:** AUTO-SAFE

```ts
const localId = `cal-${Math.random().toString(36).slice(2, 10)}`
```

~8 chars of base-36 = ~41 bits of entropy. Collision risk is real for a long-lived calendar (birthday paradox at ~1M entries). Not a security issue (markers aren't authn tokens) but `cal-${crypto.randomUUID()}` removes the worry and keeps the prefix-based marker detection working.

---

### L6. `body?.error ?? '(empty body)'` truthiness slip — falsy strings flow through
**File:** `app/calendar/page.tsx:138`

**Risk:** AUTO-SAFE

```ts
`[${res.status}] ${body?.error ?? '(empty body)'}`
```

`??` only fires on `null`/`undefined`, so `body.error = ''` (empty string) yields `[502] ` (visible space, no message). Use `body?.error || '(empty body)'` here, or check `typeof body?.error === 'string' && body.error.length > 0`.

---

### L7. `body` typed as `Record<string, unknown>` then accessed with `body?.error` etc. without narrowing
**File:** `app/calendar/page.tsx:133-141`

**Risk:** AUTO-SAFE

```ts
let body: Record<string, unknown> = {}
...
body?._tombstoned     // unknown — coerces to boolean OK but TS strict mode flags it
body?._path ? `path=${body._path}` : ''   // string-interpolating unknown
```

This compiles only because strict checks for `unknown` interpolation are lenient. Narrow once at the top:

```ts
type DeleteBody = { error?: string; _tombstoned?: boolean; _path?: string; _stack?: string; _pausedFallback?: boolean }
const body: DeleteBody = (() => { try { return JSON.parse(rawText) } catch { return {} } })()
```

---

### L8. `EventList.dayEvents` recomputes on every render
**File:** `components/calendar/EventList.tsx:36-43`

**Risk:** AUTO-SAFE

Not memoized. Re-runs the `.filter` over all events on every parent re-render (including every keystroke in the Add modal — because parent re-renders cascade). Wrap in `useMemo(() => events.filter(...), [events, selectedDate])`. Pure quality; not in scope-perf, but cheap.

---

### L9. Inline event handlers in `CalendarGrid` per cell allocate fresh closures every render
**File:** `components/calendar/CalendarGrid.tsx:97,109-118`

**Risk:** AUTO-SAFE — but explicitly out of the v1 perf scope, mentioning only because it interacts with L8 (renders are frequent here).

---

## INFO

### I1. `JobActionButtons` decides marker-ness by prefix on the client; server uses the same heuristic
**File:** `components/calendar/JobActionButtons.tsx:55-59`, `app/api/calendar/[id]/route.ts:35-37`, `app/api/calendar/sync/route.ts:111`

**Risk:** AUTO-SAFE

Triple-coded "marker = `cal-` prefix" — fine while there's only one rule, but consider extracting to `lib/calendarMarker.ts` (a non-Hermes, MC-only helper) so future changes flip one source.

---

### I2. `formatDistanceToNow(new Date(nextRun))` is invoked on potentially `null`/missing strings via TS optional chaining elsewhere, but not here
**File:** `components/calendar/EventList.tsx:30, 141, 146` and `app/calendar/page.tsx:311`

**Risk:** AUTO-SAFE

The component contract says `nextRun: string` is required (`types/calendar.ts:47`), but `hermesJobToEvent` populates it via `job.nextRunAt ?? existing?.nextRun ?? now` — so a paused job in Hermes that has no `nextRunAt` and no DDB row falls back to `now`. Render is fine, but a user pausing a job will see "in less than a minute" against it briefly. Minor.

---

### I3. `'never'` literal is used as both a sentinel and a status — see M2.

---

### I4. `lastRunStatus` color mapping accepts `evt.lastRunStatus === 'success' ? ... : evt.lastRunStatus === 'failed' ? ... : ...` — `'running'` and `undefined` fall into the gray bucket
**File:** `app/calendar/page.tsx:304-306`

**Risk:** AUTO-SAFE

Visually fine; just an inconsistency with `EventList.StatusIcon` which has an explicit `'running'` branch. Align the two so a running job glows the same color in both lists.

---

### I5. `prompt` field is stripped when "Hermes returns empty" but `skills` is intentionally pushed through even when empty
**File:** `app/api/calendar/[id]/route.ts:84-89`

**Risk:** FLAGGED (intentional semantic, comments explain — leave alone unless changing skill-clear behavior)

Already well-commented. Mentioning only so future reviewers don't "unify" the two paths.

---

## Counts

- Critical: 0
- High: 3
- Medium: 5
- Low: 9
- Info: 5
- **Total: 22**

AUTO-SAFE: 20
FLAGGED: 2 (H2 — Scan pagination touches data-access correctness in sync's destructive orphan branch; M4 — DELETE tombstone path is hermes-adjacent)

_Reviewed by: gsd-code-reviewer_
_Depth: standard_
