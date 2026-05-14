# Kanban — Iteration 1 Findings

**Reviewed:** 2026-05-14
**Verdict:** PASS-WITH-CAVEATS — no MC source defects. Two perf observations to defer to perf-cross-cutting iteration. The previously fixed "SSE cycle storm" is confirmed gone (zero new fetches over 8s idle window).

---

## Live smoke

| Check | Result | Evidence |
|---|---|---|
| Page loads | PASS | Native Hermes plugin mounted, 6 columns visible (Raw / Waiting / Assigned / Running / Human / Done), ~15 cards across them. |
| Console errors / warnings | PASS | Zero errors. Zero warnings. |
| Failed network requests | PASS (benign) | Only 2 `net::ERR_ABORTED` on `/` — initial nav aborted when we redirected to `/kanban`. |
| SSE storm in idle | PASS | 18 total API calls during init; **0 new calls during 8s idle window** after settle. Confirms the SSE cycle storm fix held. |
| Native plugin theming | PASS | Liquid Glass overrides intact, no unstyled shadcn leakage, columns + cards render correctly. |
| Bundle size | PASS | First Load JS: 102 kB (budget 300 kB). |

## Perf observations

### K-01 — TTFB 1456 ms exceeds 800 ms budget (DEV) — DEFERRED to perf-cross-cutting
- `domContentLoaded`: 1477 ms
- `loadComplete`: 2279 ms
- TTFB: 1456 ms (budget: 800 ms)
- LCP: null (not captured in preview env)

Dev-server TTFB includes Next.js per-request compilation and is not representative of prod. Perf-cross-cutting iteration will re-measure against the production build (`npm run build && npm run start`) — only then can budget compliance be ruled.

### K-02 — 4× duplicate fetches for `config` / `boards` / `board` endpoints (DEV) — DEFERRED, likely StrictMode
Intervals between the 4 calls: `[1 ms, 152 ms, 1 ms]`. Pattern is two clusters of 2 simultaneous calls, ~150 ms apart. This matches React StrictMode dev-only behavior: `HermesNativeKanbanHost` mounts → cleanup → re-mounts; the plugin's own root component does the same → 2 × 2 = 4 fetches per endpoint.

The plugin is third-party Hermes code, not MC's — MC can't suppress its useEffect doubling. Mitigation if needed: disable StrictMode in `app/layout.tsx` for kanban only (not recommended — would also hide real double-effect bugs in MC's own code). **Decision: keep StrictMode, verify prod has no duplication during perf-cross-cutting.**

Risk: AUTO-SAFE (no fix proposed; observation only).

### K-03 — Plugin fetches `/boards` and `/board?board=default` in serial-but-parallel pattern (5–18 s under contention) — Hermes-side perf
The 4 simultaneous duplicate fetches each finish in 5–18 s. Under no contention a single warm fetch is ~150–350 ms. The slow times appear to be Hermes processing 4 simultaneous identical queries — a queueing artifact. This is upstream Hermes capacity, not MC. Eliminating K-02 (StrictMode duplication) in production should bring this back to single-fetch latency.

Risk: AUTO-SAFE (no MC change).

## Code findings (HermesNativeKanbanHost.tsx)

Reviewed [components/kanban/HermesNativeKanbanHost.tsx](components/kanban/HermesNativeKanbanHost.tsx) end-to-end. No bugs. The "belt-and-suspenders" event+poll registration handles StrictMode races correctly. The Liquid Glass scoped style block is large but contained behind `.hermes-kanban-host` so it cannot leak.

**INFO only:**
- 730 lines of CSS-in-JS in a single component file is hard to scan. Consider extracting `HermesKanbanLiquidGlass` to `components/kanban/HermesKanbanLiquidGlass.css.tsx` for readability. Not a defect — pure ergonomics. Not auto-fixed.

## Action taken

- None — no source edits. K-01 and K-02 deferred to perf-cross-cutting where prod build will be measured.

## Status: PASS-WITH-CAVEATS

Carries 2 perf items into perf-cross-cutting iteration (K-01 TTFB budget, K-02 StrictMode duplication confirmation in prod). Functional smoke is clean.
