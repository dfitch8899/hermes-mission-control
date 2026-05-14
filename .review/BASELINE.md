# Baseline Snapshot — 2026-05-14

Recorded before any review-loop edits. Used by verifier to measure regression/progress.

## Build state
- `npm run build`: **PASS** (exit 0)
- `npx tsc --noEmit`: **PASS** (zero TS errors)
- Build warnings: 0

## Bundle sizes (Next.js First Load JS, per page)
| Page | Page chunk | First Load JS | Budget (300 KB) |
|------|------------|---------------|-----------------|
| / | 4.66 kB | 101 kB | ✅ |
| /agents | 6.7 kB | 93.9 kB | ✅ |
| /auth/error | 1.81 kB | 89 kB | ✅ |
| /auth/signin | 11.7 kB | 98.9 kB | ✅ |
| /calendar | 9.9 kB | 105 kB | ✅ |
| /chat | 9.8 kB | 96.9 kB | ✅ |
| /kanban | 14.4 kB | 102 kB | ✅ |
| /memory | **47.9 kB** | **148 kB** | ✅ (largest) |
| /terminal | 11.5 kB | 98.7 kB | ✅ |
| _shared baseline | — | 87.2 kB | — |

Middleware: 19.5 kB.

All pages currently pass bundle budget. /memory is the outlier — worth a look for code-splitting opportunities.

## Hermes integration baseline
- `/api/hermes/ping`: HTTP 200, **first call 3.0s** (cold ECS discovery), **warm 50-94ms** (3 consecutive calls)
- transport=direct, key configured, dashboard URL `http://16.59.57.121:9120`
- Exec endpoint: **OK (200)** — `hermes` CLI works
- Model/kanban dashboard passthrough: **401** — silently falls back to Slack
- Diagnosis from ping: "Exec endpoint OK. Dashboard passthrough unavailable (model/kanban ops use Slack fallback)"

## Build-time observations
- `[hermesEndpoint] Discovered Hermes at ...` logged **19 times** during `npm run build` — endpoint discovery runs once per dynamic /api/hermes/* route during static analysis. Wasteful but harmless (cache should dedupe). Possible finding.

## Known security advisory (flagged, not auto-fixed)
- `next@14.2.5` has a critical security advisory. Upgrade is a major dependency change — out of scope for auto-fix.

## TODO/FIXME in source
- Zero TODO/FIXME comments found in app/, components/, lib/.

## Test coverage
- No test framework. Only `scripts/test-kanban-sse-shim.js` (one ad-hoc Node test). Per plan, this loop does NOT add a full test suite.
