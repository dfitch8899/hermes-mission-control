/**
 * Hermes command client — the single entry point for Mission Control → Hermes communication.
 *
 * TRANSPORT POLICY
 * ─────────────────────────────────────────────────────────────────────
 *  exec            — terminal commands via POST /api/mc/exec on Hermes.
 *                    Direct only when HERMES_TRANSPORT=direct. NEVER Slack.
 *
 *  chatSend        — interactive chat. Direct only when configured;
 *                    falls back to Slack relay only when NOT in direct mode.
 *                    In direct mode, throws so the caller shows an error.
 *
 *  kanbanComplete / kanbanBlock / kanbanComment / modelSet
 *                  — silent write ops. Direct only. NEVER fall back to Slack.
 * ─────────────────────────────────────────────────────────────────────
 *
 * To enable direct transport set in Mission Control's .env.local:
 *   HERMES_TRANSPORT=direct
 *   HERMES_DASHBOARD_URL=http://127.0.0.1:9119  (or any non-localhost address)
 */

import type { HermesTransport, ChatSendOptions, PermissionRequest } from './hermesClient.types'
import { slackTransport }  from './hermesClient.slack'
import { directTransport } from './hermesClient.direct'

// Re-export types so callers can import everything from one place.
export type { HermesTransport, ChatSendOptions, PermissionRequest }

const USE_DIRECT = process.env.HERMES_TRANSPORT === 'direct'

/**
 * chatSend: try direct first in direct mode; if the direct endpoint says
 * "not yet implemented" (Phase 3 pending), fall through to the Slack relay
 * so the chat page continues to work while mc_gateway.py is not yet deployed.
 *
 * Real API errors (4xx/5xx from a live endpoint) are re-thrown so callers
 * see them rather than silently falling to Slack.
 */
function chatWithFallback(): HermesTransport['chatSend'] {
  return (async (...args: Parameters<HermesTransport['chatSend']>) => {
    if (USE_DIRECT) {
      try {
        return await directTransport.chatSend(...args)
      } catch (err) {
        const msg = (err as Error).message ?? ''
        if (msg.includes('not yet implemented') || msg.includes('not configured')) {
          // Phase 3 not live yet — fall through to Slack so chat page still works
        } else {
          throw err  // Real API error — propagate
        }
      }
    }
    return await slackTransport.chatSend(...args)
  }) as HermesTransport['chatSend']
}

/**
 * exec: ALWAYS direct — never Slack. If direct transport fails, the error
 * surfaces in the terminal rather than leaking to the Slack channel.
 */
function execDirect(): HermesTransport['exec'] {
  return (async (...args: Parameters<HermesTransport['exec']>) => {
    if (!USE_DIRECT) {
      throw new Error(
        'exec requires HERMES_TRANSPORT=direct. Set it in .env.local and restart.',
      )
    }
    return await directTransport.exec(...args)
  }) as HermesTransport['exec']
}

/**
 * kanban* / modelSet: direct only. NEVER fall back to Slack.
 * Sending these write ops to Slack would pollute the shared channel and
 * cause the Hermes agent to double-apply mutations.
 *
 * Two flavors:
 *
 *   directOnlyFireAndForget — kanbanComplete + kanbanBlock are advisory
 *     status updates. The next sync from Hermes will correct any drift,
 *     so a transient failure shouldn't surface to the caller.
 *
 *   directOnlyStrict — kanbanComment + modelSet are mutations whose
 *     failure has no other path to recovery: a swallowed kanbanComment
 *     means MC↔Hermes SQLite drifts and the comment is silently lost;
 *     a swallowed modelSet means DynamoDB records a new model that the
 *     dashboard never adopted. These re-throw so callers can decide.
 */
function directOnlyFireAndForget<K extends 'kanbanComplete' | 'kanbanBlock'>(
  method: K,
): HermesTransport[K] {
  return (async (...args: Parameters<HermesTransport[K]>) => {
    if (!USE_DIRECT) {
      console.warn(
        `[hermesClient] ${method}: HERMES_TRANSPORT is not "direct". Op dropped.`,
      )
      return
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (directTransport[method] as (...a: any[]) => Promise<unknown>)(...args)
    } catch (err) {
      // Log so server console shows the real failure; do NOT Slack and do
      // NOT propagate — the next sync will correct any drift.
      console.warn(`[hermesClient] ${method} failed (advisory, swallowed):`, (err as Error).message ?? err)
    }
  }) as HermesTransport[K]
}

function directOnlyStrict<K extends 'kanbanComment' | 'modelSet' | 'kanbanCreate' | 'kanbanSetStatus' | 'kanbanSpecify' | 'kanbanGetLog' | 'kanbanArchive'>(
  method: K,
): HermesTransport[K] {
  return (async (...args: Parameters<HermesTransport[K]>) => {
    if (!USE_DIRECT) {
      throw new Error(
        `${method} requires HERMES_TRANSPORT=direct. Set it in .env.local and restart.`,
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (directTransport[method] as (...a: any[]) => Promise<unknown>)(...args)
  }) as HermesTransport[K]
}

export const hermesClient: HermesTransport = {
  chatSend:        chatWithFallback(),
  exec:            execDirect(),
  // kanbanCreate + kanbanSetStatus are strict (re-throw): MC no longer keeps
  // a local DDB write fallback for these paths, so a swallowed failure would
  // silently drop the task instead of surfacing as an API error.
  kanbanCreate:    directOnlyStrict('kanbanCreate'),
  kanbanSetStatus: directOnlyStrict('kanbanSetStatus'),
  // kanbanSpecify returns a structured outcome (including ok:false reasons)
  // that the caller surfaces to the UI. Strict so a transport-level failure
  // doesn't silently look like a "no auxiliary configured" result.
  kanbanSpecify:   directOnlyStrict('kanbanSpecify'),
  // kanbanGetLog is a read — but strict so an empty/error response surfaces
  // instead of looking like "no worker log on disk yet".
  kanbanGetLog:    directOnlyStrict('kanbanGetLog'),
  // kanbanArchive: strict so a transport failure doesn't silently fall back
  // to DDB-only — that was the source of "archived tasks pop back into the
  // triage queue" bug. Better to surface the failure to the user.
  kanbanArchive:   directOnlyStrict('kanbanArchive'),
  kanbanComplete:  directOnlyFireAndForget('kanbanComplete'),
  kanbanBlock:     directOnlyFireAndForget('kanbanBlock'),
  kanbanComment:   directOnlyStrict('kanbanComment'),
  modelSet:        directOnlyStrict('modelSet'),
}
