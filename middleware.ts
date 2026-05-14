import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// HTTP Basic Auth gate. Browser handles the credential prompt natively;
// once accepted the browser caches the credentials per-origin.
//
// Set MC_USERNAME and MC_PASSWORD in your environment (.env.local locally,
// deployment env on the server). Both must be non-empty for the gate to
// engage — if either is missing, requests pass through (so local dev without
// the env vars set still works without surprises).
//
// /api/hermes/update is intentionally bypassed: Hermes posts inbound
// webhooks there with X-Hermes-Key, not basic auth.

const USER = process.env.MC_USERNAME ?? ''
const PASS = process.env.MC_PASSWORD ?? ''
const EXPECTED = USER && PASS
  ? 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')
  : ''

export function middleware(req: NextRequest) {
  if (!EXPECTED) return NextResponse.next()
  if (req.nextUrl.pathname.startsWith('/api/hermes/update')) {
    return NextResponse.next()
  }
  if (req.headers.get('authorization') === EXPECTED) {
    return NextResponse.next()
  }
  return new NextResponse('Auth required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Mission Control", charset="UTF-8"',
    },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
