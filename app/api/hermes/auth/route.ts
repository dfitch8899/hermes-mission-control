import { NextRequest, NextResponse } from 'next/server'
import { hermesClient } from '@/lib/hermesClient'

/** POST /api/hermes/auth — drive `hermes auth` on the container, return captured output.
 *
 *  Constraint we live with: mc_proxy.py invokes `hermes auth` with
 *  stdin=subprocess.DEVNULL and a 30 s timeout. If `hermes auth` is a
 *  polling-based device-code flow that prints its URL and exits after
 *  polling, this will complete the dance. If it blocks waiting for a
 *  callback or stdin, the subprocess will be killed at 30 s and we'll
 *  surface the partial output (URL line at minimum) so the user can
 *  still open the URL and complete the flow elsewhere.
 *
 *  The "right" fix for a fully-in-MC OAuth flow is to add a multi-step
 *  endpoint on mc_proxy (start → returns URL immediately, poll → checks
 *  for credentials.json). Tracked as TODO; meanwhile this single-step
 *  endpoint is the pragmatic shipping pattern.
 *
 *  Body: { command? : string }   defaults to "auth"; pass e.g.
 *                                 "auth --status" if the container's
 *                                 hermes CLI supports it.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { command?: string }
    const cmd  = (body.command ?? 'auth').trim()
    // Defense: don't let callers run arbitrary commands here. We only
    // accept `auth` and `auth <subcommand-with-flags>`. The mc_proxy
    // whitelist already enforces this server-side, but rejecting early
    // gives a clearer error and avoids a wasted round-trip.
    if (!/^auth(\s+[\w.\-]+)*$/.test(cmd)) {
      return NextResponse.json({ error: `command must start with "auth"; got: ${cmd}` }, { status: 400 })
    }

    const output = await hermesClient.exec(cmd)
    return NextResponse.json({ output: output ?? '' })
  } catch (err) {
    console.error('[api/hermes/auth POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
