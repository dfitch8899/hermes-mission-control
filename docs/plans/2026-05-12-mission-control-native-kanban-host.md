# Mission Control: Native Hermes Kanban Hosting — Corrected Plan

## Context

You want Mission Control's `/kanban` page to host the **real Hermes-native kanban board** (served by the Hermes dashboard server in the ECS container) so MC inherits all native features (timeline, runs, dispatch, handoff, dependencies, live updates, etc.) instead of porting them one-by-one into MC's custom React board.

This plan replaces the original 22-task draft. The original was correct in spirit but referenced (a) a Linux disk path (`/opt/data/hermes-src/...`) that does not exist on your Windows laptop, (b) files (`lib/config.ts`, `lib/hermes-kanban.ts`) that do not exist, and (c) routes already removed in prior commits. This plan reflects the real architecture you confirmed:

- Hermes serves the kanban frontend **over HTTP** from its dashboard FastAPI server at `127.0.0.1:9119` inside the container, reached from your laptop via `scripts/hermes-forward.ps1` (AWS Session Manager → `mc_proxy.py:9120` → `:9119`).
- The plugin manifest lives at `GET /api/dashboard/plugins`; the kanban bundle is served at `GET /dashboard-plugins/kanban/dist/index.js` with CSS at `.../style.css`; APIs at `/api/plugins/kanban/...`.
- `mc_proxy.py` enforces `X-Hermes-Key: ${HERMES_SECRET_KEY}` on every inbound request.
- Existing transport in `lib/hermesClient.direct.ts` already calls `${HERMES_DASHBOARD_URL}/api/plugins/kanban/*` for writes. Env vars `HERMES_DASHBOARD_URL`, `HERMES_TRANSPORT`, `HERMES_SECRET_KEY` are already in `.env.example`.
- DDB stays as a **read-only mirror** — `kanban_mirror.py` keeps Hermes→DDB mirroring; MC's existing `/api/kanban/*` routes stay live for other surfaces.

## Strategy

Two phases of integration. **Phase A (iframe smoke test)** gets you to a working native board inside MC in a few hours and validates the proxy/auth/WS plumbing. **Phase B (mount as React)** upgrades to in-tree React rendering for tighter chrome integration. Phase A is also the natural fallback if Phase B hits SDK-shim trouble.

Goal of this work:
- `/kanban` in Mission Control renders the real Hermes native board with full feature parity.
- All Hermes API/asset traffic flows through MC's origin via a `/api/hermes/[...path]` proxy that injects `X-Hermes-Key`.
- No silent fallback to the legacy MC custom board on the main `/kanban` route — missing config shows a blocking error.
- MC's custom kanban components and DDB-backed routes stay in the repo (the custom board is no longer the live `/kanban` surface but the DDB store still mirrors Hermes for other readers).

---

## Phase 0 — Branch and plan check-in

### Task 1: Create migration branch

```pwsh
git checkout -b feat/kanban-host-native-board
git branch --show-current   # expect: feat/kanban-host-native-board
```

### Task 2: Check this plan into the repo

```pwsh
git add docs/plans/2026-05-12-mission-control-native-kanban-host.md
git commit -m "docs: add native kanban hosting plan"
```

---

## Phase 1 — Same-origin proxy to the Hermes dashboard

### Task 3: Add the catch-all proxy route

**File (new):** `app/api/hermes/[...path]/route.ts`

Requirements:
- Resolve `base = process.env.HERMES_DASHBOARD_URL?.replace(/\/$/, '')`. If missing, return 503 JSON with `{ error: 'HERMES_DASHBOARD_URL not set' }`.
- Forward `GET`, `POST`, `PATCH`, `PUT`, `DELETE`, `HEAD`, `OPTIONS` to `${base}/${params.path.join('/')}` preserving `req.nextUrl.search`.
- Inject `X-Hermes-Key: ${process.env.HERMES_SECRET_KEY}` on outbound when present. Mirror `lib/hermesClient.direct.ts:20-22`.
- Forward inbound request body as `ArrayBuffer` (use `await req.arrayBuffer()` only when method is not GET/HEAD).
- Stream upstream response back unchanged: copy upstream status and headers (drop hop-by-hop).
- Add `export const dynamic = 'force-dynamic'` and `export const runtime = 'nodejs'`.

### Task 4: Verify middleware doesn't block the proxy

Check `middleware.ts`. Adjust only if it would block `/api/hermes/*`.

---

## Phase A — Iframe smoke test

### Task 5: Add `components/kanban/NativeKanbanUnavailable.tsx`

Client component showing operator-facing blocking error naming `HERMES_DASHBOARD_URL`, `HERMES_SECRET_KEY`, and `scripts/hermes-forward.ps1`. Includes a Retry button.

### Task 6: Replace `app/kanban/page.tsx`

Server component that gates on `HERMES_DASHBOARD_URL`:
- If unset → render `<NativeKanbanUnavailable />`
- Else → render `TopAppBar` + `<iframe src="/api/hermes/kanban" />` filling the viewport

### Task 7: Manual end-to-end verification

1. `pwsh scripts/hermes-forward.ps1`
2. `npm run dev`
3. Open `http://localhost:3000/kanban`
4. Confirm native board renders; exercise board switching, timeline, runs, comments, dispatch, handoff, retry, reclaim, unblock, live updates
5. Stop port-forward, reload, expect `NativeKanbanUnavailable`

WebSocket fallback notes if live updates fail: covered in original plan file.

---

## Phase B — Mount-in-React upgrade (optional)

Only if iframe ergonomics are unacceptable.

### Task 8: Discover plugin's runtime contract

Grep the served bundle for `window.` / `globalThis.` references. Cross-reference against https://github.com/nousresearch/hermes-agent at `plugins/kanban/dashboard/`.

### Task 9: `lib/hermes-plugin-sdk.ts`

Three helpers — `installHermesPluginSdk()`, `loadHermesPluginScript(src)`, `getRegisteredHermesPlugin(name)`. Add globals reactively, not speculatively.

### Task 10: `components/kanban/HermesNativeKanbanHost.tsx`

Client component: inject CSS, install SDK, load script, render registered plugin or error state.

### Task 11: Swap page to use mount host

Replace `<iframe>` with `<HermesNativeKanbanHost />` in `app/kanban/page.tsx`.

### Task 12: Verify mount end-to-end

Same script as Task 7 plus zero console errors and single registration.

---

## Phase 2 — Cleanup

### Task 13: Confirm no orphan imports of custom board in `app/kanban/page.tsx`

### Task 14: Remove launch-in-chat side-channel if still wired (likely already gone)

---

## Phase 3 — Docs and harden

### Task 15: `docs/kanban-native-hosting.md` operator runbook

Covers env, port-forward, asset paths, proxy behavior, WebSocket caveat, DDB mirror, maintenance.

### Task 16: `npm run build`

---

## Cut list (not deleted, no longer primary)

- `components/kanban/KanbanColumn.tsx`, `TaskCard.tsx`, `TaskDrawer.tsx`, `NewTaskModal.tsx`, `NewBoardModal.tsx` — kept for other consumers
- `app/api/kanban/*` routes — kept as DDB-backed mirror
- `hermes-agent/patches/kanban_mirror.py` — keeps mirroring Hermes → DDB
- `lib/hermesClient.direct.ts` — still used for terminal commands and non-kanban writes

---

## Risks and mitigations

1. **SPA absolute paths break under `/api/hermes/` prefix** → inject `<base href>` rewrite or fall back to Phase B.
2. **WebSocket live updates don't traverse route handler** → custom server with `http-proxy`, or direct WS to port-forward host in dev.
3. **Plugin SDK shim grows uncontrollably** → add globals only on console error.
4. **`X-Hermes-Key` leaks** → it doesn't; server-only injection.
5. **DDB and Hermes drift** → mirror is one-way and eventually consistent; consumers needing strong consistency should hit the native API.
6. **Hermes upstream format changes** → runbook records integration SHA.

---

## Definition of done

- `/kanban` renders the real Hermes native board with full feature parity.
- Misconfiguration shows `NativeKanbanUnavailable`, never a stale custom board.
- All Hermes traffic flows through `/api/hermes/[...path]` with `X-Hermes-Key` injection.
- Custom MC kanban components stay in repo but not imported from `app/kanban/page.tsx`.
- `docs/kanban-native-hosting.md` exists.
- `npm run build` succeeds.
- Branch `feat/kanban-host-native-board` ready for PR.
