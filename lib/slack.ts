/**
 * Slack transport helpers — FALLBACK ONLY.
 *
 * Mission Control now communicates with Hermes through `lib/hermesClient.ts`
 * (direct dashboard REST API when HERMES_TRANSPORT=direct).  This file is
 * retained as the Slack-relay fallback used by `lib/hermesClient.slack.ts`.
 *
 * Do NOT add new call sites for `postToSlack` outside of hermesClient.slack.ts.
 * All Mission-Control-to-Hermes communication must go through hermesClient.
 */

const USER_TOKEN     = process.env.SLACK_USER_TOKEN!
const CHANNEL_ID     = process.env.HERMES_SLACK_CHANNEL_ID!
const HERMES_USER_ID = process.env.HERMES_SLACK_USER_ID!

export interface SlackPostResult {
  ts:      string
  channel: string
}

/**
 * Post a message to the Hermes Slack channel as the user.
 * senderName  – display name shown in the prefix (e.g. "Alice")
 * agentId     – optional agent tag appended to the prefix (e.g. "coding")
 */
export async function postToSlack(
  text:       string,
  senderName: string,
  agentId?:   string,
): Promise<SlackPostResult> {
  const agentTag  = agentId ? ` :: agent=${agentId}` : ''
  const formatted = `<@${HERMES_USER_ID}> [Mission Control${senderName ? ` – ${senderName}` : ''}${agentTag}] ${text}`

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method:  'POST',
    headers: { Authorization: `Bearer ${USER_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ channel: CHANNEL_ID, text: formatted, as_user: true }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack post failed: ${data.error}`)
  return { ts: data.ts, channel: data.channel }
}
