# Review Goal — Mission Control Full-App Audit

This file is the authoritative exit criteria. The independent completion auditor reads ONLY this file (plus BUDGETS.json and the findings/ tree) and decides DONE or NOT DONE. If a check below is not met, the loop continues.

## Functionality (per feature area)
Every documented action works against live Hermes and every error path degrades gracefully:

1. **Kanban** — load board, drag-drop, create task, edit task, comment, delete, SSE updates live without storm
2. **Calendar / Cron** — list jobs, create job (multi-word), edit, pause, resume, run now, delete, schedule display correct
3. **Chat** — send message, receive streamed reply, approval flow, thread history
4. **Terminal** — execute command, see output, error handling
5. **Agents** — list, create, edit, delete, pick agent
6. **Memory** — list, create, search, edit, delete
7. **Auth** — sign-in, sign-out, session persistence, protected routes
8. **Dashboard /** — renders, links to all features

## Hermes integration health
- `/api/hermes/ping` returns 200 within 500ms
- Endpoint discovery cache works (cold + warm path)
- `X-Hermes-Key` never leaks to client bundles (grep build output)
- SSE proxy passes through without buffering, no reconnect storm in 10 min idle
- Cron CLI hybrid routing works for single-word and multi-word args
- 5xx / 401 invalidate cache and retry
- Inbound webhook `/api/hermes/update` validates auth and writes DynamoDB

## Performance budgets
See BUDGETS.json for machine-readable thresholds. Summary:
- LCP < 2.5s on all primary pages
- TTFB < 800ms initial navigation
- Per-page JS < 300KB gzipped
- No SSE/WS connection storm
- < 5 renders per user action on hot paths
- `/api/hermes/*` median < 300ms when warm

## Code quality gates
- `npm run build` clean (zero TS errors, zero blocking warnings)
- `npm run typecheck` clean
- Zero `console.error` in dev console during golden path of each feature
- Zero unhandled promise rejections in 10-min smoke
- No new `any` types; existing ones justified or replaced
- Dead code removed or flagged

## Coverage
- Every page route has a smoke check (loads + primary action)
- Every `lib/hermes*` file has documented end-to-end call path

## Acceptance protocol
- An area marked `pass` requires verifier evidence (logs, screenshots, or timings) in its finding file.
- An area marked `flagged` requires a human acknowledgement note before being counted toward DONE.
- `failed` areas (5+ attempts) block DONE until escalated or resolved.
