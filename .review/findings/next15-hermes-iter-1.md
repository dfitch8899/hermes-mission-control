# Next 15 Hermes Integration Review — iter-1

Scope: Hermes integration files only. Verdict against the 6 Next 15 change vectors.

## File verdicts

### `app/api/hermes/[...path]/route.ts` — PASS
Codemod transform is correct on all 7 handlers (lines 134-161). Each follows the new shape:
```ts
export async function GET(req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return forward(req, params.path)
}
```
`req.method` (line 63), header forwarding (lines 52-58), and `req.nextUrl.search` (line 50) are unchanged in Next 15 and untouched by the codemod. `export const dynamic = 'force-dynamic'` (line 21) is still honored — harmless under the new default-uncached behavior. SSE pass-through (`new Response(upstream.body, …)` line 127) streams unbuffered; explicit `x-accel-buffering: no` and `cache-control: no-cache` on `text/event-stream` (lines 122-125) defend against Vercel buffering. No reliance on Next 14 auto-cache: every `fetch` (line 73) is a server-side proxy with `redirect: 'manual'`, no cache options requested, no caching desired.

### `app/api/hermes/update/route.ts` — PASS
POST only. No GET cache exposure. Auth check on line 7-12 reads `X-Hermes-Key` header directly — no Next 15 API change. `await req.json()` (line 15) unchanged.

### `app/api/hermes/sync/route.ts` — PASS, with one note
GET handler (line 44) returns DynamoDB-derived metadata. **In Next 14 this would have been auto-cached at the route-handler level**; in Next 15 it is uncached by default — which is the desired behavior for a live "last synced" timestamp. No code change needed; the new default is actually correct here. POST (line 49) is unaffected.

### `app/api/hermes/ping/route.ts` — PASS, with note
GET diagnostic (line 19). Same Next 14→15 flip: previously this would have been incorrectly cached on the build (returning stale `dashboardUrl` between deploys); the new default makes it always-fresh, which is what `ping` needs. `fetch()` calls on lines 53 and 72 hit dynamic IPs via `AbortSignal.timeout` — no cache opt-in, so they correctly bypass cache in both Next 14 (POST, never cached) and Next 15.

### `app/api/hermes/model/route.ts` — PASS
GET (line 10) reads DynamoDB. Same beneficial flip as `/sync` and `/ping` — uncached-by-default is desired since the active model can change at any time via POST. No internal `fetch` calls.

### `middleware.ts` — PASS
`req.nextUrl.pathname` (line 23) and `req.headers.get('authorization')` (line 26) are stable on `NextRequest` in Next 15 (verified against Next 15 migration notes — middleware `NextRequest` shape unchanged). Matcher config (line 38) syntax unchanged. Auth bypass for `/api/hermes/update` (line 23) still functions.

### `next.config.js` — PASS
Minimal config. `output: 'standalone'` is unchanged in Next 15. No deprecated options (no `experimental.serverActions`, no `swcMinify`, no `images.domains`).

### `app/layout.tsx` — PASS
`warmHermesEndpoint()` (line 45) is fire-and-forget in a server component. Server components and `NEXT_PHASE` gating both unchanged in Next 15. No `fetch` calls in this file.

### `lib/hermesClient.ts`, `hermesClient.direct.ts`, `hermesClient.slack.ts` — PASS
All `fetch()` calls (e.g. `direct.ts:58, 128, 141, 152, 172, 188`; `slack.ts:62-69`) are runtime calls from API route handlers, not RSC-render fetches. They never relied on Next 14 fetch auto-cache (no `revalidate`, no `cache` option ever set), and `AbortSignal.timeout` plus dynamic dashboard URLs makes them inherently dynamic. New uncached default is a no-op for this code.

### `lib/hermesEndpoint.ts` — PASS
AWS-SDK calls, not `fetch`. `globalThis` cache (lines 45-50) is in-process and orthogonal to Next's fetch cache.

### `lib/hermesCron.ts` — PASS
Pure orchestration over `hermesClient`. No `fetch`, no route-handler concerns.

### `lib/hermes-plugin-sdk.ts` — SUSPECT (client router cache, Q4)
Client-side. The `fetchJSON` helper (line 83) and the `EventSource` shim (line 371) run in the browser, not the server. Neither uses Next's `<Link>` prefetch or RSC navigation, so `staleTimes.dynamic = 0` doesn't apply to plugin data. **However**: the kanban host page (`/kanban`) is a Next route. If any parent page relies on client router cache to keep the host mounted across navigations, that's out of this file's scope but worth flagging — within this file, `installKanbanEventsShim` (line 293) and `_registry` (line 232) all live on `window`/`globalThis` and survive navigations regardless of the router cache. No bug observed in scope.

## Cross-cutting

1. **fetch auto-cache:** No Hermes code opted into Next 14 auto-cache via `revalidate` or `cache: 'force-cache'`. Default flip is a no-op.
2. **Route GET cache:** None of the 5 in-scope GET handlers wanted Next 14's cache behavior. New default is strictly better.
3. **`params` Promise:** Codemod correct on the only catch-all that has params.
4. **`staleTimes`:** Not relied on within scope.
5. **Middleware APIs:** Unchanged usage.
6. **Streaming:** Catch-all forwards `upstream.body` unchanged; SSE headers set explicitly.

**Overall: PASS.** One SUSPECT note on plugin SDK is precautionary, not a substantiated bug.
