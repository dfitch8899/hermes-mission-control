# Hermes Integration — Iteration 1 Findings

**Reviewed:** 2026-05-14
**Agents:** gsd-code-reviewer (source), gsd-integration-checker (live HTTP)
**Verdict:** ALL items FLAGGED — per review plan, any change to `lib/hermes*` or `app/api/hermes/**` requires human review before applying. Loop will mark this area `flagged` and continue to other areas. Completion auditor can only declare DONE after these are human-acknowledged.

---

## Live smoke results

| Check | Status | Evidence |
|---|---|---|
| `/api/hermes/ping` warm | PASS | 5 sequential pings: 53–63 ms, all 200, transport=direct, exec ok |
| `/api/hermes/api/plugins/manifest` proxy | **FAIL** (env, not source) | HTTP 500 — stale `.next/server/vendor-chunks/fast-xml-parser.js`. **Cleared in this iteration via dev-cache rebuild — re-verify below.** |
| `/api/hermes/dashboard-plugins/*.js` cache headers | **FAIL** (same root cause) | HTTP 500 vendor-chunk error |
| SSE `/api/hermes/api/kanban/events` | **FAIL** (same root cause) | HTTP 500 vendor-chunk error |
| `/api/calendar` GET | PASS | 200, DDB-only path |
| `/api/hermes/update` wrong key | PASS | 401 |
| `/api/hermes/update` correct key + invalid body | PASS | 400 (field validator) |
| Endpoint cache TTL = 30 min | PASS (doc mismatch) | code: 30 min, header docstring: 5 min |
| Secret leakage in client bundles | PASS | only string `"HERMES_SECRET_KEY"` (label) found in `.next/static`, no key value |

**Root cause of 3 FAILs:** stale dev `.next/` vendor chunks not regenerated. Catch-all proxy imports `@aws-sdk/client-ecs` + `@aws-sdk/client-ec2` (via `lib/hermesEndpoint.ts`); the vendor chunks weren't on disk. NOT a source defect. Resolution: stop dev → `rm -rf .next` → restart.

---

## HIGH

### H-01 — `directOnly()` swallows errors that the type contract says must propagate — FLAGGED
**File:** `lib/hermesClient.ts:87-94`

`directOnly` wraps `kanbanComplete`, `kanbanBlock`, `kanbanComment`, `modelSet` and console.warn-s on failure. But `kanbanComment` type contract says it must succeed-or-throw (otherwise MC ↔ Hermes SQLite drifts); `modelSet` failure silently desyncs DDB-recorded model from dashboard.

**Fix:** Split into `directOnlyFireAndForget` (kanbanComplete/Block) and `directOnlyStrict` (kanbanComment/modelSet that re-throws).

---

### H-02 — Proxy invalidates endpoint cache on any 5xx; direct client only on 502 — FLAGGED
**Files:** `app/api/hermes/[...path]/route.ts:91-93` vs. `lib/hermesClient.direct.ts:51,110,124,136,151,171`

After redeploy, 503/504 from draining task → proxy re-discovers IP, direct client keeps hammering stale IP for 30 min (TTL).

**Fix:** Add `shouldInvalidateOn(status, hadNetworkError)` helper in `hermesEndpoint.ts`, use in both. Move predicate into `lib/hermesClient.direct.ts::checkResponse` so all call sites are covered. (Same as M-01.)

---

### H-03 — `hermesEndpoint` cache TTL comment says 5 min; code uses 30 min — FLAGGED (per rail)
**File:** `lib/hermesEndpoint.ts:6-10` vs `:75-80`

Code is correct (30 min, intentional). Header comment is stale. Pure docstring fix but in a flagged file.

**Fix:** Update header to "and caches it for 30 minutes (invalidated proactively on 5xx / network errors)".

---

## MEDIUM

### M-01 — `checkResponse` doesn't invalidate cache on 5xx — FLAGGED
Same root as H-02; the fix lives in `lib/hermesClient.direct.ts::checkResponse`.

### M-02 — `chatSend` direct 401 doesn't match fallback trigger substrings — FLAGGED
**File:** `lib/hermesClient.direct.ts:50-54` + `lib/hermesClient.ts:42-51`. 401 produces `"chatSend failed: HTTP 401 — …"`; fallback checks `'not yet implemented'|'not configured'`. 401 is re-thrown to user instead of falling back. Comment says "Phase 3 not live yet — fall through to Slack so chat page still works" → fix: call `checkResponse` from direct chatSend.

### M-03 — SSE `[DONE]` only breaks inner for-loop, outer `while(true)` continues — FLAGGED
**File:** `lib/hermesClient.direct.ts:67-93`. Hangs on upstream that keeps connection open briefly after `[DONE]`. Fix: hoist `done` flag.

### M-04 — `warmHermesEndpoint()` fires once per prerendered route during `next build` (19x noise) — FLAGGED
**File:** `app/layout.tsx:39`. Wasteful AWS API calls during build; any flaky network can fail the build.
**Fix:** `if (process.env.NEXT_PHASE !== 'phase-production-build') warmHermesEndpoint()`.

### M-06 — `/api/hermes/sync` swallows exec failure, polls 30s for nothing — FLAGGED
**File:** `app/api/hermes/sync/route.ts:57-71`. When transport isn't direct, the exec throw is eaten, then polls a sync that never ran. UI shows 30s spinner for nothing.
**Fix:** Surface `triggerError` in response; short-circuit poll loop when present.

---

## LOW

### L-01 — `slackTransport.exec` is unreachable (dead code) — FLAGGED
`lib/hermesClient.slack.ts:153-156`. Policy says exec is always direct. Either remove method or document.

### L-02 — `SLACK_BOT_TOKEN!` / `HERMES_SLACK_BOT_ID!` non-null asserts lie in direct-only deploys — FLAGGED
`lib/hermesClient.slack.ts:12-13`. Use `?? ''` + `assertSlackConfigured()` guard.

### L-03 — `model/route.ts` `.catch()` after `modelSet()` is dead — FLAGGED
Becomes load-bearing if H-01 is applied.

### L-04 — `directTransport.modelSet`/`exec` rely on `mc_proxy` whitespace-split for safety — FLAGGED
Defense in depth: validate model name shape `/^[A-Za-z0-9._-]+$/`.

### L-05 — `parseCronList` regex `/[─-╿]/g` is a too-wide Unicode range — FLAGGED (in flagged file)
`lib/hermesCron.ts:254`. U+2500–U+2FFC — covers far more than box-drawing. Fix: `/[─-╿]/g`.

### L-06 — `timeAgo` has unnecessary `lower===1?1000:lower` special-case — FLAGGED (in flagged file)
`lib/hermes-plugin-sdk.ts:65-77`. Pure refactor, behavior identical.

### L-07 — `KanbanEventsShim._connect` swallows `err` silently — FLAGGED (in flagged file)
`lib/hermes-plugin-sdk.ts:369-374`. Add `console.warn` for debuggability.

### L-08 — Cron `withAuthRetry` matches "401" anywhere in message — FLAGGED
`lib/hermesCron.ts:135`. Use `\b401\b|\bUnauthorized\b`.

---

## INFO

- I-02 — `String(err)` in `ping/route.ts:43,80` loses non-Error detail. Use `err instanceof Error ? err.message : String(err)`.
- I-04 — `hermesEndpoint._discover` has no in-flight dedup; two concurrent cold callers fire 3 AWS calls each.
- I-05 — Catch-all proxy buffers request body into RAM via `arrayBuffer()`; fine today but blocks large uploads if added later.

---

## Action taken in this iteration
- **No source fixes applied** — all 16 actionable findings touch `lib/hermes*` or `app/api/hermes/**`, automatically FLAGGED per safety rails.
- **Dev environment fix:** cleared `.next/` and restarted dev server to resolve the 3 vendor-chunk 500s. Re-verification logged below.

## Re-verification after dev-cache clear

After stopping dev, `rm -rf .next`, restart:
- `/api/hermes/api/plugins/manifest` → **HTTP 404** "Frontend not built. Run: cd web && npm run build" — MC proxy is healthy; Hermes-side has no plugin frontend built. **Hermes-side finding, not MC.**
- `/api/hermes/api/kanban/events` (SSE) → **HTTP 401** "Unauthorized" — MC proxy reaches Hermes; Hermes rejects the request. The catch-all proxy DOES inject `X-Hermes-Key`. SSE may require browser-session auth (cookie) that curl doesn't carry, OR Hermes's SSE endpoint expects a different auth mechanism. **Worth investigating in kanban iteration** — see if the browser-side EventSource actually gets through with the cookie/session set by `/auth/signin`.

The 500s are resolved; the remaining failures are integration-truth findings, not MC bugs.

## H-EXTRA — Hermes proxy plugin manifest unreachable (Hermes-side, but MC-visible)
Either Hermes needs `cd web && npm run build` run inside the ECS task, or MC needs to handle the 404 gracefully (today it would let the kanban native plugin loader fail with a confusing error). Suggest MC add an explicit "Hermes frontend not built" check in the plugin SDK with actionable guidance.

## H-EXTRA-2 — SSE auth mismatch
Hermes SSE rejects requests carrying only `X-Hermes-Key`. If the browser EventSource succeeds because of session cookies that MC's same-origin proxy passes through, document that explicitly in `hermes-plugin-sdk.ts` so future maintainers don't break the auth path. If it doesn't succeed, this is a real bug.

---

## Awaiting Human

This entire findings list is human-review-gated. To unblock the completion auditor's DONE verdict, either:
1. Acknowledge and accept findings (mark `flagged` as accepted in STATE.json), or
2. Apply fixes (recommend tackling H-01, H-02/M-01, M-03, M-04, H-EXTRA-2 first — highest impact).
