# Agents Feature — Code Review (iter-1)

**Reviewed:** 2026-05-14
**Scope:** `app/agents/page.tsx`, `components/agents/*`, `app/api/agents/route.ts`, `app/api/agents/[agentId]/route.ts`, `app/api/agents/seed/route.ts`
**Depth:** standard

---

## Summary

The agents feature is functional and the seed endpoint is *largely* idempotent in its default (non-force) mode — it only inserts missing builtins and does NOT overwrite existing rows. That answers the headline concern: calling `/api/agents/seed` on every page load (and twice in StrictMode) does no destructive work after the first call. However there are several real issues: a logic bug in the `force` branch that silently throws away user customizations to non-prompt fields, **zero auth on any mutation endpoint**, **zero input validation on PATCH** (size/type/whitelist), a TOCTOU race between seed and concurrent edits, no concurrency control on PATCH (last-write-wins), and per-page-load seed calls that are wasteful even if non-destructive.

| Severity | Count |
|---|---|
| Critical | 3 |
| Warning  | 6 |
| Info     | 4 |

---

## Critical

### CR-01 — No authentication / authorization on any mutation endpoint  [FLAGGED]

**Files:**
- `app/api/agents/route.ts:42` (POST)
- `app/api/agents/[agentId]/route.ts:25` (PATCH)
- `app/api/agents/[agentId]/route.ts:61` (DELETE)
- `app/api/agents/seed/route.ts:9` (POST, incl. `?force=1`)

**What's wrong:** None of the mutation handlers check identity, session, or any token. Anyone who can reach the deployment can create, edit, delete user agents, and trigger a force-reseed that nukes user `systemPrompt` (see CR-02). `?force=1` is a particularly nasty handle for a drive-by — a single unauthenticated `POST /api/agents/seed?force=1` rewrites every builtin row.

```ts
// app/api/agents/[agentId]/route.ts:61
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { agentId } = params
  // … no auth check, straight to DynamoDB
```

**Fix:** Add the project's session/auth middleware (whatever `/api/kanban` or `/api/calendar` uses — confirm and reuse) to every non-GET handler. At minimum gate `?force=1` behind an admin role or an env-guarded admin token. Consider gating GET too if agents include private prompts.

**Classification:** FLAGGED (auth change).

---

### CR-02 — `force` seed branch destroys user-customized model/policy/icon/color/name [FLAGGED]

**File:** `app/api/agents/seed/route.ts:37-50`

**What's wrong:** The comment promises "overwrite model/policy fields but keep user-edited systemPrompt." The code actually does the opposite of "preserve user edits" for every field except `systemPrompt`. `...agent` spreads the builtin AFTER nothing, so the only preserved field is `systemPrompt`. If a user renamed "Coding" to "My Coding", changed the icon, swapped `workerModel`, or flipped `orchestratorPolicy` to `always`, a single `?force=1` reverts all of it.

```ts
// app/api/agents/seed/route.ts:39-50
await ddb.send(new PutCommand({
  TableName: TABLES.agents,
  Item: {
    pk: 'AGENT',
    sk: `AGENT#${agent.agentId}`,
    ...agent,                                       // ← builtin wins
    // Preserve user edits to systemPrompt unless it's still the default
    systemPrompt: existing.systemPrompt ?? agent.systemPrompt,
    createdAt:    existing.createdAt ?? now,
    updatedAt:    now,
  },
}))
```

Also the comment "*unless it's still the default*" doesn't match the code — `existing.systemPrompt ?? agent.systemPrompt` keeps the existing value verbatim regardless of whether it equals the default; the only way `agent.systemPrompt` is used is if `existing.systemPrompt` is null/undefined.

**Fix:** Either (a) spread `existing` first then overlay only the fields you intend to refresh, or (b) define an explicit `RESEED_FIELDS` whitelist:

```ts
const RESEED_FIELDS = ['orchestratorModel','workerModel','orchestratorPolicy'] as const
const merged = { ...existing }
for (const k of RESEED_FIELDS) merged[k] = (agent as any)[k]
merged.updatedAt = now
```

Then `PutCommand` with `merged`. Also fix the misleading comment.

**Classification:** FLAGGED (seed-logic change).

---

### CR-03 — No input validation on PATCH; user can write arbitrary giant fields and break invariants [FLAGGED]

**File:** `app/api/agents/[agentId]/route.ts:25-58`

**What's wrong:** PATCH whitelists *keys* but never validates *values*:

- `name` / `description` have no max length (POST clips to 60/200 — PATCH doesn't).
- `systemPrompt` has no size cap at all (POST also doesn't — DynamoDB item limit is 400KB; a 350KB prompt is a foot-gun and a cost amplifier).
- `orchestratorPolicy` is not constrained to the union `'auto'|'always'|'never'` (or whatever the type allows) — caller can write `"yolo"` and break the UI.
- `orchestratorModel` / `workerModel` are not validated against `MODEL_OPTIONS` or even type-checked — caller can write an object, number, or 50KB string.
- No check that `agentId` exists (UpdateCommand on a missing key silently creates a partial item with only `updatedAt` + whatever fields were sent). Combined with the lack of auth this is a way to write garbage rows under `pk='AGENT'`.
- No check that the target is not a builtin — a user can rewrite a builtin's `systemPrompt` via PATCH, which is inconsistent with DELETE's builtin guard.

**Fix:** Add a validator (zod or hand-rolled) and apply the same `slice` limits POST uses; reject unknown enum values; load the existing item first and 404 if missing; either block PATCH on builtins or only allow `systemPrompt` edits on them — pick a policy and document it.

```ts
const POLICIES = new Set(['auto','always','never'])
if (body.orchestratorPolicy !== undefined && !POLICIES.has(body.orchestratorPolicy)) {
  return NextResponse.json({ error: 'invalid policy' }, { status: 400 })
}
if (typeof body.systemPrompt === 'string' && body.systemPrompt.length > 8000) {
  return NextResponse.json({ error: 'systemPrompt too long' }, { status: 400 })
}
// …etc
```

**Classification:** FLAGGED (touches auth posture + schema-adjacent constraints).

---

## Warning

### WR-01 — TOCTOU race in seed: parallel callers double-insert same builtin

**File:** `app/api/agents/seed/route.ts:12-36`

**What's wrong:** The endpoint reads all `pk='AGENT'` items, builds `existingMap`, then issues `PutCommand` for missing builtins. There's no `ConditionExpression`. React StrictMode fires `useEffect` twice in dev, both effects start before either Put returns, both see the same empty `existingMap`, both `Put` — and `PutCommand` is an upsert, so the second write clobbers `createdAt` set by the first (both will be `now`, but if seeded items diverge in time, or in prod under concurrent first-time loads from two browsers, you get last-write-wins on `createdAt`). Today the damage is small (idempotent overwrite of identical data) but the pattern is fragile — once anyone edits a row mid-seed, the seed can stomp it.

```ts
// app/api/agents/seed/route.ts:32
await ddb.send(new PutCommand({
  TableName: TABLES.agents,
  Item: { pk: 'AGENT', sk: `AGENT#${agent.agentId}`, ...agent, createdAt: now, updatedAt: now },
}))
```

**Fix:** Add `ConditionExpression: 'attribute_not_exists(pk)'` to the non-force insert. The "create only if missing" intent then becomes atomic.

```ts
new PutCommand({
  TableName: TABLES.agents,
  Item: { pk: 'AGENT', sk: `AGENT#${agent.agentId}`, ...agent, createdAt: now, updatedAt: now },
  ConditionExpression: 'attribute_not_exists(pk)',
})
```
Catch the `ConditionalCheckFailedException` and treat as "already seeded → skip".

**Classification:** FLAGGED (seed-logic).

---

### WR-02 — Seed is called on every page load (StrictMode 2x in dev)

**File:** `app/agents/page.tsx:18-24`

**What's wrong:** `useEffect` fires once per mount. The `seeded` ref dedupes within a single mount only — it does NOT survive remounts or full page navigations. Every visit to `/agents` triggers a `POST /api/agents/seed` that does a full `Query` of the partition before deciding to no-op. The behavior is non-destructive (good) but wasteful: 1 Dynamo Query per visit, billed and latency-paying for nothing after the first time.

```ts
// app/agents/page.tsx:18
useEffect(() => {
  if (seeded.current) return
  seeded.current = true
  fetch('/api/agents/seed', { method: 'POST' })
    .catch(() => {})
    .finally(loadAgents)
}, [])
```

**Fix:** Either (a) move seeding to a one-time server-side migration/admin endpoint and stop calling it from the page; (b) gate the client call behind `localStorage.getItem('agents-seeded') !== 'v1'`; or (c) merge seed-if-needed into the `GET /api/agents` handler so the page only makes one round trip.

**Classification:** AUTO-SAFE (page-level cleanup) for option (b); FLAGGED for option (a)/(c).

---

### WR-03 — PATCH is last-write-wins; concurrent editors silently overwrite each other

**File:** `app/api/agents/[agentId]/route.ts:25-58`

**What's wrong:** No `version` field, no `ConditionExpression` on `updatedAt`. Two tabs open on the same agent → both save → the second wins, no warning.

**Fix:** Add optimistic concurrency: include `expectedUpdatedAt` in the PATCH body, use `ConditionExpression: '#updatedAt = :expected'`; on `ConditionalCheckFailedException` return 409.

**Classification:** FLAGGED (touches write semantics).

---

### WR-04 — PATCH UpdateCommand can resurrect/zombify deleted agents

**File:** `app/api/agents/[agentId]/route.ts:46-52`

**What's wrong:** DynamoDB `UpdateCommand` is upsert-by-default. If user A deletes an agent while user B has the editor open, B's Save will *recreate* the row with only `updatedAt` plus whatever B changed — the other fields (`name`, `systemPrompt`, etc.) will be absent. Combined with no auth (CR-01) this is a sharp edge.

**Fix:** Add `ConditionExpression: 'attribute_exists(pk)'`.

```ts
new UpdateCommand({
  …,
  ConditionExpression: 'attribute_exists(pk)',
})
```

**Classification:** FLAGGED (write semantics).

---

### WR-05 — `String(err)` leaks internals to clients

**Files:** `app/api/agents/route.ts:71`, `app/api/agents/[agentId]/route.ts:20,56,81`, `app/api/agents/seed/route.ts:58`

**What's wrong:** `return NextResponse.json({ error: String(err) }, { status: 500 })` returns raw error text — AWS SDK errors include table names, region, request IDs, sometimes ARNs. Useful in dev, bad in prod.

```ts
// repeated pattern
} catch (err) {
  return NextResponse.json({ error: String(err) }, { status: 500 })
}
```

**Fix:** Log full error server-side (only the GET list and seed POST currently do this), return a generic `{ error: 'Internal error' }` in prod (gate on `process.env.NODE_ENV`).

**Classification:** AUTO-SAFE.

---

### WR-06 — `agentId` from URL is interpolated unsanitized into the sort key

**Files:** `app/api/agents/[agentId]/route.ts:14, 48, 68, 76`

**What's wrong:** DynamoDB parameterizes values, so this is *not* an injection in the SQL sense — but `agentId` is never validated. A request to `/api/agents/AGENT%23evil` produces an `sk` of `AGENT#AGENT#evil`, which is harmless but messy. More importantly: there's no length cap, so a 10KB `agentId` is wasted RCU per call.

**Fix:** Validate `/^agent-[a-z0-9-]{6,40}$/` at the top of each handler; 400 on miss. Cheap and tightens the surface.

**Classification:** AUTO-SAFE.

---

## Info

### IN-01 — `GET /api/agents` swallows errors and returns `{agents: []}` with 200

**File:** `app/api/agents/route.ts:35-38`

```ts
} catch (err) {
  console.error('[api/agents GET]', err)
  return NextResponse.json({ agents: [] })
}
```

The UI then renders the "No agents yet 🤖" empty state on what is actually a DynamoDB outage. Consider returning 503 so the client can show a real error.

**Classification:** AUTO-SAFE.

---

### IN-02 — `Math.random()` for ID generation

**File:** `app/api/agents/route.ts:46`

```ts
const agentId = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
```

4 base36 chars (~20 bits) of randomness + `Date.now()` is fine for low-volume single-user, but two creates in the same ms have a real collision floor. Since `agentId` doubles as the DynamoDB sort key, a collision would silently overwrite an existing agent (POST uses `PutCommand` with no `attribute_not_exists` guard).

**Fix:** Use `crypto.randomUUID()` (Node 18+) or at minimum add `ConditionExpression: 'attribute_not_exists(pk)'` to the POST PutCommand.

**Classification:** AUTO-SAFE (UUID swap); FLAGGED if combined with a schema/PK change.

---

### IN-03 — GET single agent uses Query where GetItem suffices

**File:** `app/api/agents/[agentId]/route.ts:11-15`

`QueryCommand` with both `pk` and `sk` equality works but is slower and pricier than `GetItem`. Same pattern in DELETE's preflight read at line 65.

**Fix:** Swap to `GetCommand`. Pure perf/cleanup, no behavior change.

**Classification:** AUTO-SAFE.

---

### IN-04 — Empty `.catch(() => {})` hides network failures from users

**Files:** `app/agents/page.tsx:22, 31`, `components/agents/AgentPickerModal.tsx:18`

```ts
fetch('/api/agents/seed', { method: 'POST' })
  .catch(() => {})
  .finally(loadAgents)
```

The picker modal's fetch has no `.catch` at all — an unhandled rejection if the API is down.

**Fix:** Set a `loadError` state and surface it. Even a toast is better than silence.

**Classification:** AUTO-SAFE.

---

## Direct answers to your specific questions

1. **Is `/api/agents/seed` idempotent?** *In default mode, yes* — it only inserts missing builtins, no overwrites. StrictMode's double call is harmless but produces 2x DynamoDB Query+Put traffic on first seed (WR-01).
2. **Does it overwrite user customizations?** *Default mode: no. `?force=1` mode: yes, and worse than the comment implies — it overwrites everything except `systemPrompt` (CR-02).*
3. **Called too aggressively?** *Yes — every page load issues a Query even when nothing needs seeding (WR-02). Non-destructive but wasteful.*
4. **DynamoDB race conditions on concurrent edits?** *Yes, three of them: seed-vs-seed (WR-01), edit-vs-edit (WR-03), edit-vs-delete (WR-04). None have ConditionExpressions.*
5. **Auth on mutations?** *None whatsoever, including on `?force=1` (CR-01).*
6. **Input validation on create/edit?** *POST has size-clipping but no enum/type validation; PATCH has neither (CR-03).*

---

## Classification roll-up

**AUTO-SAFE (can patch without sign-off):** WR-05, WR-06, IN-01, IN-02, IN-03, IN-04, and WR-02 if implemented as a localStorage guard.

**FLAGGED (auth / schema / seed-logic — needs sign-off):** CR-01, CR-02, CR-03, WR-01, WR-03, WR-04, and WR-02 if implemented server-side.

---

_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
