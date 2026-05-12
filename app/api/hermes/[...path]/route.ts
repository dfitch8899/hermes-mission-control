/**
 * Catch-all same-origin proxy to the Hermes dashboard.
 *
 * Forwards `${MC_ORIGIN}/api/hermes/<path>` → `${HERMES_DASHBOARD_URL}/<path>`,
 * injecting the shared `X-Hermes-Key` header that `mc_proxy.py` requires.
 *
 * Used by `app/kanban/page.tsx` to host Hermes's native kanban SPA, plugin
 * bundle, plugin CSS, and plugin API under MC's origin so the bundle's
 * root-relative fetches and script src URLs land back on us.
 */

import { NextRequest, NextResponse } from 'next/server'

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
  const base = process.env.HERMES_DASHBOARD_URL?.replace(/\/$/, '')
  if (!base) {
    return NextResponse.json(
      { error: 'HERMES_DASHBOARD_URL not set' },
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
    return NextResponse.json(
      {
        error: 'Hermes dashboard unreachable',
        detail: err instanceof Error ? err.message : String(err),
        target: target.toString(),
      },
      { status: 502 },
    )
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
