# Memory / Knowledge Feature — Code Review (Iteration 1)

**Reviewed:** 2026-05-14
**Depth:** standard (with targeted deep-dive on perf + DDB)
**Scope:** `app/memory/page.tsx`, `components/memory/**`, `app/api/memories/route.ts`, `app/api/memories/[id]/route.ts`, memory-relevant slices of `lib/dynamodb.ts`
**Summary counts:** Critical 3 · Warning 7 · Info 4

Classification key: `AUTO-SAFE` = orchestrator may auto-apply. `FLAGGED` = requires human review (touches DynamoDB schema, auth, or hermes-sync transport).

---

## CRITICAL

### CR-01 — No auth on memory mutation endpoints (POST / PUT / DELETE)
**Severity:** Critical
**Classification:** FLAGGED (auth)
**Files:**
- `app/api/memories/route.ts:60` (POST)
- `app/api/memories/[id]/route.ts:26` (PUT), `:66` (DELETE), `:9` (GET)

**What's wrong:** None of the four mutation handlers (and the singleton GET) check identity. Anyone who can reach the host can create, overwrite, or wipe arbitrary memory rows. PUT is particularly bad — it accepts `Partial<Memory>` and writes every key from the body verbatim:

```ts
for (const [key, value] of Object.entries(updateFields)) {
  if (key === 'updatedAt') continue
  const safeKey = `#${key}`
  const safeVal = `:${key}`
  updateExpressions.push(`${safeKey} = ${safeVal}`)
  expressionAttributeNames[safeKey] = key
  expressionAttributeValues[safeVal] = value
}
```

A caller can inject arbitrary attributes (e.g. `__owner`, `source: "hermes"` to forge provenance, or huge blobs to balloon RCU/WCU cost).

**Fix:** Add the same auth guard the rest of the API uses (or introduce one if missing) before the `try` block in each handler. At minimum, gate POST/PUT/DELETE behind a session/bearer check; whitelist updatable fields in PUT (`title`, `content`, `type`, `tags`, `relevanceScore`, `relatedTaskIds`).

---

### CR-02 — `/api/memories` GET uses an unbounded full-table Scan
**Severity:** Critical (scales badly + cost)
**Classification:** FLAGGED (DDB schema)
**File:** `app/api/memories/route.ts:35-45`

**What's wrong:**

```ts
const cmd = new ScanCommand({
  TableName: TABLES.memories,
  ...(filterExpressions.length > 0 && {
    FilterExpression: filterExpressions.join(' AND '),
    ...
  }),
  Limit: limit,
})
```

`Scan` reads every item then filters in-memory; DynamoDB `Limit` applies *before* filtering, so a tight Limit silently drops valid rows. With 84 skills + memories today this works; at thousands it will blow latency budget and cost. It also explains the observed ~2s page-load latency in dev — cold Scans on a small partition can still take 1–2s.

Also: no pagination — `LastEvaluatedKey` is discarded.

**Fix (FLAGGED, schema change):** Add a GSI keyed on `type` (or `source`) with `createdAt` as sort key. Switch to `QueryCommand` for type/source filters; reserve `Scan` for the unfiltered "show all" path and add `ExclusiveStartKey` pagination. Until the GSI lands, increase `Limit` (or remove it) when filters are present, since the current `Limit: 100` + filter pattern can return < 100 valid rows even when more exist.

---

### CR-03 — `params` not awaited in dynamic route (Next 15 breakage)
**Severity:** Critical (runtime warning today, hard break on upgrade)
**Classification:** AUTO-SAFE
**File:** `app/api/memories/[id]/route.ts:5-7, 9, 26, 66`

**What's wrong:**

```ts
interface Params {
  params: { id: string }
}
export async function GET(_req: NextRequest, { params }: Params) {
  const cmd = new GetCommand({ ..., Key: { memoryId: params.id } })
```

In Next.js 15 `params` is a `Promise`. Accessing `params.id` synchronously logs `Error: Route used params.id. params should be awaited` and will throw in a future minor. All three handlers (GET/PUT/DELETE) are affected.

**Fix:**
```ts
interface Params { params: Promise<{ id: string }> }
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  // ...use id...
}
```

---

## WARNING

### WR-01 — `/api/hermes/sync` fired on every memory-page mount (incl. StrictMode double-mount)
**Severity:** Warning (UX + cost; explains the "2x hermes-sync" symptom)
**Classification:** FLAGGED (touches hermes-sync)
**File:** `app/memory/page.tsx:56-59`

```ts
useEffect(() => {
  Promise.all([fetchMemories(), fetchSyncMeta()])
    .finally(() => setLoading(false))
}, [fetchMemories, fetchSyncMeta])
```

`fetchSyncMeta` GETs `/api/hermes/sync` which does a DDB GetCommand for `_HERMES_SYNC_META`. That's fine — but in dev React StrictMode mounts twice, producing the observed 2x. The bigger issue: every visit to `/memory` re-hits DDB even though sync metadata barely changes.

**Fix:** Cache sync meta in a small SWR/`useRef`+stale-while-revalidate hook keyed by minute, OR move it server-side via a Server Component so the first paint already has it. POST-side `handleSync` already refetches, so the mount fetch is purely "what's the current state" — perfect SWR fit. (Note: this is *meta only* — it does NOT call hermesClient.exec on GET, so it's not actually running the Python script on each load. The "slow" feel is the 2s DDB round-trip during StrictMode double-mount.)

---

### WR-02 — Bundle bloat: react-markdown + remark-gfm loaded eagerly for a modal users may never open
**Severity:** Warning (this is the answer to "why is /memory 47.9KB")
**Classification:** AUTO-SAFE
**File:** `components/memory/MemoryReadingView.tsx:4-5`, imported eagerly by `components/memory/MemoryGrid.tsx:7`

```ts
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
```

`react-markdown@9` + `remark-gfm@4` together are roughly 30–40 KB gzipped of the page chunk. They are only needed when the user clicks a card to open the reading-view modal. `MemoryGrid` statically imports `MemoryReadingView`, so the markdown deps land on the initial bundle.

**Fix:**
```ts
// MemoryGrid.tsx
const MemoryReadingView = dynamic(() => import('./MemoryReadingView'), { ssr: false })
```
Expected savings: ~30 KB First Load JS, dropping `/memory` out of the "largest page" slot. `date-fns/formatDistanceToNow` is also pulled in twice (`MemoryCard` + `MemoryReadingView`); fine, tree-shaken, but verify only the two named imports are used (they are).

---

### WR-03 — PUT handler accepts and writes arbitrary attributes
**Severity:** Warning (data-integrity; pairs with CR-01)
**Classification:** FLAGGED (auth/schema)
**File:** `app/api/memories/[id]/route.ts:30-47`

`updateFields = { ...body, updatedAt: now }` then everything is written. A client can:
- Overwrite `createdAt`, `version`, `source: 'hermes'` (forge provenance), `memoryId` (technically deleted but `version` etc. are not).
- Inject novel attributes that pollute the row.
- Send `relevanceScore: "not-a-number"` — no type checks.

**Fix:** Whitelist updatable keys explicitly:
```ts
const ALLOWED = ['title','content','type','tags','relevanceScore','relatedTaskIds'] as const
const updates = Object.fromEntries(
  Object.entries(body).filter(([k]) => (ALLOWED as readonly string[]).includes(k))
)
```
Plus validate `type ∈ {context,skill,improvement}`, `relevanceScore ∈ [0,1]`, `tags: string[]`.

---

### WR-04 — POST handler has no input validation
**Severity:** Warning
**Classification:** AUTO-SAFE
**File:** `app/api/memories/route.ts:60-84`

```ts
const memory: Memory = {
  memoryId: `MEM-${uuid().slice(0, 8).toUpperCase()}`,
  ...
  title: body.title || 'Untitled Memory',
  content: body.content || '',
  type: body.type || 'context',
  ...
}
```
No checks on `type` (could be `"<script>"`), `relevanceScore` (could be `NaN`/string/`-9999`), `tags` (could be non-array), or content length (could be MBs and blow DDB 400KB item limit with a confusing later error). `memoryId` collision space is 16^8 ≈ 4B — fine for now, but truncating uuid removes most of its entropy guarantees; consider keeping more chars or using `crypto.randomUUID()`.

**Fix:** Add a zod (or hand-rolled) validator before constructing `memory`. Reject with 400 on invalid input rather than silently coercing.

---

### WR-05 — Fallback path leaks mock data on production DDB errors
**Severity:** Warning
**Classification:** AUTO-SAFE
**File:** `app/api/memories/route.ts:50-57` and `:86-101`

On DDB failure GET returns `MOCK_MEMORIES`, POST returns a fabricated row with `_mock: true`. The client at `app/memory/page.tsx:41` doesn't inspect `_mock`, so a transient DDB error silently swaps real data for mocks and the user sees confident-looking fake records.

**Fix:** Return `500` on real failure (or at minimum `503` with `Retry-After`), and let the client render an error banner. Reserve mock fallback for `NODE_ENV !== 'production'` or remove entirely.

---

### WR-06 — Page-mount `setMemories(MOCK_MEMORIES)` causes a flash of mock data
**Severity:** Warning
**Classification:** AUTO-SAFE
**File:** `app/memory/page.tsx:27`

```ts
const [memories, setMemories] = useState<Memory[]>(MOCK_MEMORIES)
```

Initial render seeds with mocks. `loading` is true so the Grid isn't shown — but if `loading` ever flips false before `fetchMemories` resolves (it can't today, but adding a third fetch to the `Promise.all` would change that), users see fake data first. Also: mocks ship in the client bundle.

**Fix:** `useState<Memory[]>([])` and rely on the `loading` gate; or fetch via Server Component so first paint is already real.

---

### WR-07 — Card animation delay grows linearly with index (`animationDelay: ${i * 60}ms`)
**Severity:** Warning (UX bug for scale)
**Classification:** AUTO-SAFE
**File:** `components/memory/MemoryCard.tsx:27` (set by `MemoryGrid.tsx:225`)

```ts
animationDelay: `${index * 60}ms`,
```

At 84 cards the last card waits `84 * 60ms = 5.04s` before appearing. With 200+ memories this gets absurd. Also re-runs on every filter change because index resets.

**Fix:** Cap the cascade: ``animationDelay: `${Math.min(index, 12) * 60}ms` `` (or drop the stagger entirely past the first viewport).

---

## INFO

### IN-01 — Search filter is O(n·m) on every keystroke; no debounce
**Severity:** Info
**Classification:** AUTO-SAFE
**File:** `components/memory/MemorySearch.tsx:14-17`, `components/memory/MemoryGrid.tsx:49-62`

Every keystroke calls `onSearch` synchronously, which updates `searchQuery`, which recomputes `filtered` (full filter+sort) and re-renders all `MemoryCard`s. Fine at 84 items; visible jank at 1k+.

**Fix:** Debounce `onSearch` ~120ms, and/or `useDeferredValue(searchQuery)` for the filter pass. `MemoryCard` is already `React.memo`'d so the cost is mostly the filter+sort itself.

---

### IN-02 — `tags` cap of 20 in sidebar is silent
**Severity:** Info
**Classification:** AUTO-SAFE
**File:** `components/memory/MemoryGrid.tsx:34-37`

`.slice(0, 20)` hides any further tags with no "+N more" affordance. Easy to overlook tag-based filtering. Either show a counter or surface most-frequent tags rather than first-seen order.

---

### IN-03 — `<select>` is uncontrolled-looking + missing label association
**Severity:** Info (a11y)
**Classification:** AUTO-SAFE
**File:** `components/memory/MemoryGrid.tsx:154-172`

The visible label `<p>Sort</p>` is not tied to the `<select>` via `htmlFor`/`id` or `aria-label`. Screen readers announce the select with no name. Same pattern repeats for the search input (`MemorySearch.tsx:28-37` — no `aria-label`).

**Fix:** Add `aria-label="Sort memories"` to the select and `aria-label="Search memories"` to the input.

---

### IN-04 — Markdown content rendered untrusted via ReactMarkdown
**Severity:** Info (low risk today, FYI for future)
**Classification:** FLAGGED (touches stored content semantics)
**File:** `components/memory/MemoryReadingView.tsx:88-196`

`react-markdown@9` is XSS-safe by default (it does not render raw HTML and `rehype-raw` is not added), so currently fine. Worth noting: if anyone later adds `rehype-raw` for HTML pass-through, stored memory content from the `user` source becomes a stored-XSS sink. Add a comment guarding that, or explicitly set `skipHtml` for defense-in-depth.

---

## Performance summary — why is `/memory` the largest bundle?

Concrete contributors (in approximate descending order):
1. **react-markdown + remark-gfm** loaded eagerly (~30KB gz) — WR-02.
2. **`MOCK_MEMORIES`** shipped in client bundle via `app/memory/page.tsx:6` — WR-06. Probably 2–5KB depending on mock size.
3. **date-fns** named imports — already tree-shakeable, low impact, but verify with `next build --analyze`.
4. **lucide-react** — only `Search` and `X` are imported; with `optimizePackageImports` Next 14+ tree-shakes this; if not configured, the full icon set could be bundled.

Fix WR-02 alone should drop `/memory` below the other heavy routes.

---

## Why `/api/memories` 2x latency observed

- StrictMode dev double-mount → 2 calls.
- Each call is a full-table `Scan` (CR-02). Cold path on small partition still ~1–2s end-to-end on us-east-2 with cold Lambda-style runtime.
- Fix: GSI + `Query` for filtered paths, plus single-flight on the client (a tiny `useRef` "already fetching" guard).

---

_Reviewed by: gsd-code-reviewer_
_Iteration: 1_
