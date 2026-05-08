/**
 * Hermes command client — the single entry point for Mission Control → Hermes communication.
 *
 * TRANSPORT POLICY
 * ─────────────────────────────────────────────────────────────────────
 *  chatSend / exec   — interactive ops that need a streamed reply.
 *                      Try direct first when configured; fall back to
 *                      the Slack relay so the terminal always gets a
 *                      response while the direct chat endpoint (Phase 3)
 *                      is still pending.
 *
 *  kanbanComplete / kanbanBlock / kanbanComment / modelSet
 *                    — silent write ops. Try direct when configured;
 *                      silent-fail otherwise. NEVER fall back to Slack —
 *                      these must not pollute the shared Slack channel.
 * ─────────────────────────────────────────────────────────────────────
 *
 * To enable direct transport set these in Mission Control's OWN environment
 * (not just in the hermes-agent container):
 *   HERMES_TRANSPORT=direct
 *   HERMES_DASHBOARD_URL=http://<hermes-host>:9119
 */

import type { HermesTransport, ChatSendOptions, PermissionRequest } from './hermesClient.types'
import { slackTransport }  from './hermesClient.slack'
import { directTransport } from './hermesClient.direct'

// Re-export types so callers can import everything from one place.
export type { HermesTransport, ChatSendOptions, PermissionRequest }

const USE_DIRECT = process.env.HERMES_TRANSPORT === 'direct' && !!process.env.HERMES_DASHBOARD_URL

/**
 * chatSend / exec: try direct, fall back to Slack on "not configured / not
 * yet implemented" signals. Real errors are re-thrown.
 */
function withSlackFallback<K extends 'chatSend' | 'exec'>(method: K): HermesTransport[K] {
  return (async (...args: Parameters<HermesTransport[K]>) => {
    if (USE_DIRECT) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (directTransport[method] as (...a: any[]) => Promise<unknown>)(...args)
      } catch (err) {
        const msg = (err as Error).message ?? ''
        if (
          !msg.includes('not configured') &&
          !msg.includes('not yet implemented') &&
          !msg.includes('HERMES_DASHBOARD_URL not set')
        ) {
          throw err  // Real API error — propagate
        }
        // Phase 3 endpoint not yet live → fall through to Slack relay
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (slackTransport[method] as (...a: any[]) => Promise<unknown>)(...args)
  }) as HermesTransport[K]
}

/**
 * kanban* / modelSet: try direct when configured; NEVER fall back to Slack.
 * Sending these write ops to Slack would pollute the shared channel and
 * cause the Hermes agent to double-apply mutations.
 */
function directOnly<K extends Exclude<keyof HermesTransport, 'chatSend' | 'exec'>>(
  method: K,
): HermesTransport[K] {
  return (async (...args: Parameters<HermesTransport[K]>) => {
    if (!USE_DIRECT) {
      // Not configured — warn once per method to help diagnose misconfiguration.
      console.warn(`[hermesClient] directOnly(${method}): direct transport not active (HERMES_TRANSPORT=${process.env.HERMES_TRANSPORT ?? 'unset'}, HERMES_DASHBOARD_URL=${process.env.HERMES_DASHBOARD_URL ?? 'unset'}). Op dropped.`)
      return
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (directTransport[method] as (...a: any[]) => Promise<unknown>)(...args)
    } catch (err) {
      // Log so server console shows the real failure; do NOT Slack.
      console.warn(`[hermesClient] directOnly(${method}) failed:`, (err as Error).message ?? err)
    }
  }) as HermesTransport[K]
}

export const hermesClient: HermesTransport = {
  chatSend:       withSlackFallback('chatSend'),
  exec:           withSlackFallback('exec'),
  kanbanComplete: directOnly('kanbanComplete'),
  kanbanBlock:    directOnly('kanbanBlock'),
  kanbanComment:  directOnly('kanbanComment'),
  modelSet:       directOnly('modelSet'),
}
