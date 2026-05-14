# Perf Cross-Cutting — Iteration 1 Findings

**Reviewed:** 2026-05-14
**Verdict:** PASS — all perf budgets met in production. Dev-mode-only artifacts confirmed dev-only.

---

## Production TTFB (curl, port 55604, `npm run build && npm run start`)

| Page | TTFB | Total | HTML size | Budget (800ms) |
|---|---|---|---|---|
| `/` | 6ms | 6ms | 31 KB | ✅ |
| `/kanban` | 52ms | 52ms | 21 KB | ✅ |
| `/calendar` | 8ms | 8ms | 38 KB | ✅ |
| `/chat` | 6ms | 6ms | 14 KB | ✅ |
| `/terminal` | 6ms | 6ms | 22 KB | ✅ |
| `/agents` | 7ms | 7ms | 20 KB | ✅ |
| `/memory` | 6ms | 6ms | 20 KB | ✅ |

Dev-mode TTFB was 500–1500ms — 100% Next.js per-request compilation overhead, not a real performance issue.

## Production bundle sizes (after dynamic-import fix)

| Page | Page chunk | First Load JS | Δ vs baseline | Budget (300 KB) |
|---|---|---|---|---|
| `/` | 4.66 kB | 101 kB | unchanged | ✅ |
| `/agents` | 6.7 kB | 93.9 kB | unchanged | ✅ |
| `/calendar` | 13.8 kB | 106 kB | +3.9 kB (in-flight ref + visibility logic) | ✅ |
| `/chat` | 9.8 kB | 97 kB | unchanged | ✅ |
| `/kanban` | 14.4 kB | 102 kB | unchanged | ✅ |
| `/memory` | **4.76 kB** | **101 kB** | **−43 kB / −47 kB First Load** | ✅ |
| `/terminal` | 11.5 kB | 98.8 kB | unchanged | ✅ |

`/memory` went from largest to typical thanks to the [MemoryReadingView](components/memory/MemoryGrid.tsx) dynamic import.

## StrictMode duplication — confirmed dev-only

Kanban live in prod browser:
- Total API calls: **7** (dev: 18)
- Unique endpoints: 6
- Duplicates: only `/api/hermes/dashboard-plugins/kanban/dist/index.js` × 2 (preload + script tag — expected)

The dev observation **K-02 (4× boards/board/config fetches)** does NOT occur in production. The previous concern from kanban-iter-1.md is resolved.

## SSE storm — confirmed gone

Kanban dev observation: 0 new API calls in 8s idle after settle. Production: 0 new calls observed during a 10s wait after `loadComplete`. The SSE cycle storm fix (commit e34acc9) holds.

## Production navigation timing — /kanban

- TTFB: 48ms
- DOMContentLoaded: 60ms
- LoadComplete: 277ms
- LCP: null (Chrome's PerformanceObserver doesn't expose LCP in this preview env; visually the board paints inside the LoadComplete window)

## Outstanding perf concerns (FLAGGED, deferred)

These were surfaced in earlier iterations and remain unaddressed because the fixes are FLAGGED (Hermes/auth-touching):

- **M-04** (hermes): `warmHermesEndpoint()` fires ~19× during `npm run build`. Wasteful AWS API calls.
- **M-06** (hermes): `/api/hermes/sync` swallows exec failure and polls 30s. UX cost when Hermes is unreachable.
- **WR-06** (memory): 5s animation cascade at 84 cards (`animationDelay: index * 60ms`). Visual perf only.
- **CR-02** (memory): unbounded ScanCommand with filter-after-limit silently drops rows. Correctness > perf.

## Verdict for this area

**PASS** — all measurable perf budgets met in production. The dev-mode anomalies traced to React StrictMode + Next.js dev compilation, both expected. The two auto-safe fixes (calendar dedupe, memory dynamic import) ship real wins.
