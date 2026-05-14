import { NextResponse } from 'next/server'
import { probeProfileSync } from '@/lib/hermesProfileSync'

export const dynamic = 'force-dynamic'

/** GET /api/hermes/profile-sync/status
 *
 *  Surfaces the live reachability of Hermes `/api/profiles/*` from MC.
 *  Used by the /agents page to show an honest banner about whether
 *  MC's agent fields are actually driving Hermes behavior.
 *
 *  Response: `{ ok, status, detail?, httpStatus? }` from probeProfileSync.
 */
export async function GET() {
  const result = await probeProfileSync()
  return NextResponse.json(result)
}
