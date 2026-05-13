/**
 * Catch-all same-origin proxy to the Hermes dashboard.
 *
 * Forwards `${MC_ORIGIN}/api/hermes/<path>` → `${HERMES_DASHBOARD_URL}/<path>`,
 * injecting the shared `X-Hermes-Key` header that `mc_proxy.py` requires.
 *
 * Used by `app/kanban/page.tsx` to host Hermes's native kanban SPA, plugin
 * bundle, plugin CSS, and plugin API under MC's origin so the bundle's
 * root-relative fetches and script src URLs land back on us.
 *
 * The upstream URL is resolved via `lib/hermesEndpoint.ts`:
 *   - If HERMES_DASHBOARD_URL is set to a non-localhost address it is used directly.
 *   - Otherwise the current Hermes ECS task's public IP is auto-discovered and cached.
 * A 5xx / network error invalidates the cache so the next request re-discovers
 * (handles IP changes after a task redeploy).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getHermesDashboardUrl, invalidateHermesEndpointCache } from '@/lib/hermesEndpoint'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
])

async function forward(req: NextRequest, segments: string[]): Promise<Response> {
  let base: string
  try {
    base = await getHermesDashboardUrl()
  } catch (err) {
    return NextResponse.json(
      {
        error:  'Hermes dashboard endpoint could not be resolved',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    )
  }

  const target = new URL(`${base}/${segments.join('/')}`)
  target.search = req.nextUrl.search

  const headers = new Headers()
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP.has(lower)) return
    if (lower === 'host') return
    headers.set(key, value)
  })
  const secret = process.env.HERMES_SECRET_KEY
  if (secret) headers.set('X-Hermes-Key', secret)

  const init: RequestInit = {
    method:   req.method,
    headers,
    redirect: 'manual',
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = await req.arrayBuffer()
  }

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), init)
  } catch (err) {
    // The cached IP may be stale (task got redeployed). Drop the cache so the
    // next request re-discovers from ECS.
    invalidateHermesEndpointCache()
    return NextResponse.json(
      {
        error:  'Hermes dashboard unreachable',
        detail: err instanceof Error ? err.message : String(err),
        target: target.toString(),
      },
      { status: 502 },
    )
  }

  // 5xx from upstream usually means the task is unhealthy or restarting.
  // Invalidate the discovery cache so the next request rediscovers (covers
  // the case where ECS spun up a new task on a different IP).
  if (upstream.status >= 500 && upstream.status < 600) {
    invalidateHermesEndpointCache()
  }

  const respHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return
    respHeaders.set(key, value)
  })

  return new Response(upstream.body, {
    status:     upstream.status,
    statusText: upstream.statusText,
    headers:    respHeaders,
  })
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(req, params.path)
}
export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(req, params.path)
}
export async function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(req, params.path)
}
export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(req, params.path)
}
export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(req, params.path)
}
export async function HEAD(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(req, params.path)
}
export async function OPTIONS(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(req, params.path)
}
