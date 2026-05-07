/**
 * Hermes command client — the single entry point for Mission Control → Hermes communication.
 *
 * Transport selection (via HERMES_TRANSPORT env var):
 *   "direct"  — calls the Hermes dashboard REST API on localhost (Phase 2+).
 *               Falls back to Slack transport if HERMES_DASHBOARD_URL is not set
 *               or if the direct call throws a "not configured / not implemented" error.
 *   "slack"   — (default) routes via the Slack channel relay (legacy path, always available).
 *
 * To enable direct transport (Phase 2+):
 *   1. Add `hermes dashboard --no-open &` to the ECS task-def startup command.
 *   2. Set HERMES_DASHBOARD_URL=http://127.0.0.1:9119 in the ECS environment.
 *   3. Set HERMES_TRANSPORT=direct in the ECS environment.
 *
 * Usage:
 *   import { hermesClient } from '@/lib/hermesClient'
 *   await hermesClient.kanbanComment(taskId, text, senderName)
 */

import type { HermesTransport, ChatSendOptions, PermissionRequest } from './hermesClient.types'
import { slackTransport }  from './hermesClient.slack'
import { directTransport } from './hermesClient.direct'

// Re-export types so callers can import everything from one place.
export type { HermesTransport, ChatSendOptions, PermissionRequest }

const TRANSPORT = process.env.HERMES_TRANSPORT ?? 'slack'
const USE_DIRECT = TRANSPORT === 'direct' && !!process.env.HERMES_DASHBOARD_URL

/**
 * Build a transport that tries `primary` and, on a "not configured / not implemented"
 * error, transparently falls back to `fallback`.
 */
function withFallback(primary: HermesTransport, fallback: HermesTransport): HermesTransport {
  const wrap = <K extends keyof HermesTransport>(method: K): HermesTransport[K] => {
    return (async (...args: Parameters<HermesTransport[K]>) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (primary[method] as (...a: any[]) => Promise<unknown>)(...args)
      } catch (err) {
        const msg = (err as Error).message ?? ''
        if (msg.includes('not configured') || msg.includes('not yet implemented') || msg.includes('HERMES_DASHBOARD_URL not set')) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return await (fallback[method] as (...a: any[]) => Promise<unknown>)(...args)
        }
        throw err
      }
    }) as HermesTransport[K]
  }

  return {
    chatSend:       wrap('chatSend'),
    kanbanComplete: wrap('kanbanComplete'),
    kanbanBlock:    wrap('kanbanBlock'),
    kanbanComment:  wrap('kanbanComment'),
    modelSet:       wrap('modelSet'),
    exec:           wrap('exec'),
  }
}

export const hermesClient: HermesTransport = USE_DIRECT
  ? withFallback(directTransport, slackTransport)
  : slackTransport
