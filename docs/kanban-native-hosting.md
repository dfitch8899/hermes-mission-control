# Native Hermes Kanban Hosting

Mission Control's `/kanban` route hosts the **real Hermes-native kanban board** rather than its own custom React board. MC becomes a thin host shell: it proxies all kanban frontend assets and API calls through MC's own origin (with the shared `X-Hermes-Key` injected server-side), and embeds the Hermes SPA route in an iframe.

This document is the operator/maintainer runbook.

## How it works

```
Browser ──> http://localhost:3000/kanban  (Mission Control page)
            │
            ├─ renders <iframe src="/api/hermes/kanban">
            │
            └─ iframe document + all its sub-requests
                       ──> /api/hermes/[...path]   (catch-all proxy)
                                │  injects X-Hermes-Key
                                ▼
                       ${HERMES_DASHBOARD_URL}/<path>
                                │
                                ▼  (in dev: AWS Session Manager)
                       mc_proxy.py:9120 → Hermes :9119
```

The Hermes dashboard serves a single SPA. Visiting `/kanban` there returns the dashboard `index.html`, which then loads `/dashboard-plugins/kanban/dist/index.js` + `style.css` and discovers plugins via `/api/dashboard/plugins`. The plugin's React component talks to `/api/plugins/kanban/...`. Because every request goes through MC at the iframe origin, all those root-relative URLs resolve to MC's `/api/hermes/...` and proxy back to Hermes transparently.

## Required environment

| Var                    | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `HERMES_DASHBOARD_URL` | Base URL of the Hermes dashboard (e.g. `http://127.0.0.1:9120`) |
| `HERMES_SECRET_KEY`    | Shared key — must match the Hermes container's    |

No new env vars were introduced for native hosting. These already exist for `lib/hermesClient.direct.ts`.

## Connecting to Hermes in development

Hermes runs inside an ECS Fargate task and is not directly reachable from your laptop. Use the AWS Session Manager port-forward:

```pwsh
pwsh scripts/hermes-forward.ps1
```

Prerequisites:
- AWS CLI v2
- AWS Session Manager Plugin
- AWS credentials with `ecs:ExecuteCommand` on the Hermes cluster

When the forward is up, `HERMES_DASHBOARD_URL` should point at the local port the script exposes (default `http://127.0.0.1:9120`).

## What Hermes serves (paths inside the dashboard)

| Path                                            | What it is                                  |
| ----------------------------------------------- | ------------------------------------------- |
| `/kanban`                                       | SPA route → returns dashboard `index.html`  |
| `/dashboard-plugins/kanban/dist/index.js`       | Plugin JS bundle                            |
| `/dashboard-plugins/kanban/dist/style.css`      | Plugin CSS                                  |
| `/api/dashboard/plugins`                        | Plugin manifest discovery                   |
| `/api/plugins/kanban/...`                       | Plugin REST API (boards, tasks, comments, runs, timeline, dispatch, handoff, etc.) |

All of these are reached from the browser as `/api/hermes/<same-path>` after MC's proxy.

## How the proxy works

[`app/api/hermes/[...path]/route.ts`](../app/api/hermes/%5B...path%5D/route.ts) is a Next.js catch-all route handler that forwards every method (`GET`, `POST`, `PATCH`, `PUT`, `DELETE`, `HEAD`, `OPTIONS`) to `${HERMES_DASHBOARD_URL}/<path>`. Key behaviors:

- **Auth injection:** adds `X-Hermes-Key: ${HERMES_SECRET_KEY}` server-side so the browser never sees the key.
- **Header passthrough:** copies request and response headers verbatim except hop-by-hop (`connection`, `transfer-encoding`, etc.) and `host`.
- **Body fidelity:** uses `req.arrayBuffer()` for non-GET/HEAD, preserving binary payloads.
- **Response streaming:** returns `new Response(upstream.body, ...)` so large bundles stream rather than buffering.
- **Failure modes:**
  - 503 if `HERMES_DASHBOARD_URL` is unset.
  - 502 if the upstream `fetch` throws (port-forward down, DNS, etc.).
  - Upstream status codes pass through unchanged otherwise.

## WebSocket / live-events caveat

The Hermes kanban plugin uses live updates. If those reach the browser over WebSocket or SSE, route handlers cannot proxy them — Next.js route handlers don't support WebSocket upgrades.

Workarounds, in order of preference:

1. **Verify it's actually broken first.** SSE (Server-Sent Events) is just a long-lived HTTP response and works through the route handler. If Hermes uses SSE not WS, no action needed.
2. **Dev-only:** allow the iframe document to connect directly to `localhost:9120` for the WS only. CSP and same-origin caveats apply.
3. **Custom Next.js server:** add a tiny `server.js` that handles `upgrade` events with `http-proxy`. Required for production.
4. **Polling fallback:** if the plugin supports it, configure a polling interval and skip WS entirely.

## Failure modes and debugging

**`/kanban` shows "Hermes kanban is unreachable"**
- `HERMES_DASHBOARD_URL` is empty. Check `.env.local`.

**`/kanban` loads but the iframe shows a 502 or blank page**
- Port-forward isn't running. `pwsh scripts/hermes-forward.ps1`.
- Hermes container is unhealthy. Check ECS task status.

**Iframe renders but plugin doesn't load**
- Open browser DevTools → Network → look for failed requests to `/api/hermes/dashboard-plugins/kanban/dist/...`.
- Compare against direct upstream:
  ```pwsh
  curl -I -H "X-Hermes-Key: <key>" http://127.0.0.1:9120/dashboard-plugins/kanban/dist/index.js
  ```
- If direct works but proxied doesn't, the proxy route is at fault. If neither works, Hermes isn't serving the bundle (rebuild needed in container).

**Plugin loads but API calls 401**
- `HERMES_SECRET_KEY` mismatch with the container.
- Check the proxy is actually setting the header — add a temporary `console.log` in `app/api/hermes/[...path]/route.ts` if needed.

**Comments/mutations don't persist**
- Confirm requests are hitting `/api/hermes/api/plugins/kanban/...` (native API), not `/api/kanban/...` (the legacy DDB-mirror routes).

## DynamoDB mirror

MC's legacy DDB-backed kanban routes (`/api/kanban/*`) are still live. They are NOT used by the native board — they serve as a **read-only mirror** for other MC surfaces (e.g. agent views) and for offline visibility.

The mirror direction is **Hermes → DDB**, performed by `kanban_mirror.py` running inside the Hermes container (see `hermes-agent/patches/kanban_mirror.py`). It tails Hermes's `kanban.db` SQLite and writes events/tasks/comments to the `hermes-kanban` DynamoDB table.

If a future MC surface needs strong consistency with the live board, point it at the proxied native API (`/api/hermes/api/plugins/kanban/...`) rather than the DDB routes.

## Maintenance — when Hermes upstream changes

The integration target is the `hermes-agent` repo: <https://github.com/nousresearch/hermes-agent>.

If Hermes changes its plugin manifest format or asset URLs:
- Update the proxy if a path prefix moves.
- For Phase B (mount-in-React), update `lib/hermes-plugin-sdk.ts` only when a console error names a missing global. Don't speculate.

Record the Hermes commit SHA you integrate against here when you cut a stable version:

| Date       | Hermes SHA | Notes                              |
| ---------- | ---------- | ---------------------------------- |
| 2026-05-12 | _TBD_      | Initial native hosting integration. Task def `hermes-agent:37`. |

## Hermes ECS task-def changes (rev 37)

This integration required three changes inside the Hermes container's task definition (`hermes-agent` family, revision 37 is the live one as of 2026-05-12):

1. **Launch the dashboard alongside the gateway.** The deployed `hermes` binary doesn't have a `dashboard` subcommand in this build; the web server module exists at `/opt/data/hermes-src/hermes_cli/web_server.py` on the EFS volume. The container command base64-decodes a launcher script to `/opt/data/dashboard_launcher.py` that:
   - strips the editable-install meta-path finders (they pin `hermes_cli` to the older `/opt/hermes` source);
   - prepends `/opt/data/hermes-src` to `sys.path`;
   - imports `hermes_cli.web_server.start_server` and runs it with `host='0.0.0.0', port=9119, allow_public=True, open_browser=False`.
   - Output is piped through `sed -u 's/^/[dashboard] /'` so it shows up in CloudWatch with a `[dashboard]` prefix.
2. **Bind to `0.0.0.0` rather than `127.0.0.1`.** Hermes's `host_header_middleware` rejects requests whose Host header doesn't match the bound interface. `mc_proxy.py` only rewrites the Host on the *first* request of each TCP connection — Node's `fetch` keep-alive bypasses subsequent rewrites and gets blocked. Binding to `0.0.0.0` short-circuits the validation (per Hermes's own docstring: "0.0.0.0 bind means operator explicitly opted into all-interfaces; no protection possible at this layer"). External access is still gated by `mc_proxy.py`'s `X-Hermes-Key` check on the only publicly exposed port (9120).
3. **`start_server(allow_public=True)`** is required to bind a non-loopback host. Without it, `web_server.py` exits at startup.

If you re-deploy the Hermes task with `hermes dashboard` as a real subcommand or with the web frontend (`web/dist/index.html`) prebuilt, the launcher can collapse to `hermes dashboard --no-open --host 127.0.0.1 --port 9119`.

## Why we mount instead of iframe

The original plan considered an iframe pointed at `/api/hermes/kanban`. The Hermes web dashboard's catch-all returns 404 saying *"Frontend not built. Run: cd web && npm run build"* — the SPA HTML wrapper isn't built into this image. The plugin's JS bundle and CSS are available; we host the plugin React component directly via [components/kanban/HermesNativeKanbanHost.tsx](../components/kanban/HermesNativeKanbanHost.tsx) and a minimal SDK shim at [lib/hermes-plugin-sdk.ts](../lib/hermes-plugin-sdk.ts).

The SDK shim provides what the plugin actually reads from `window.__HERMES_PLUGIN_SDK__`:
- `React` and the hooks it uses (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`)
- Shadcn-style primitives — `Card`, `CardContent`, `Badge`, `Button`, `Input`, `Label`, `Select`, `SelectOption` (`Select` translates shadcn `onValueChange` to a native `onChange`)
- Utilities — `cn` (clsx wrapper) and `timeAgo`
- `fetchJSON(url)` — rewrites `/api/*` to `/api/hermes/api/*` so plugin traffic transits MC's same-origin proxy

When adding new globals: only after a console error names a missing global. Keep the shim minimal.

## Cut list

Files that no longer drive the live `/kanban` UI but stay in the repo for now:

- `components/kanban/KanbanColumn.tsx`, `TaskCard.tsx`, `TaskDrawer.tsx`, `NewTaskModal.tsx`, `NewBoardModal.tsx`
- `app/api/kanban/*` route handlers (DDB-backed)
- `app/api/kanban/[taskId]/launch` flow + `app/chat/page.tsx` "Carry Out with Hermes" handler

Remove these in a follow-up after confirming no other page imports them.
