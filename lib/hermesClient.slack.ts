/**
 * Slack-relay transport for the Hermes command client.
 *
 * Routes all Hermes interactions through the Slack channel, which Hermes's
 * gateway process monitors.  This is the legacy path and remains the fallback
 * while the direct-dashboard transport is not yet configured.
 */

import type { HermesTransport, ChatSendOptions, PermissionRequest } from './hermesClient.types'
import { postToSlack } from './slack'

const BOT_TOKEN     = process.env.SLACK_BOT_TOKEN!
const HERMES_BOT_ID = process.env.HERMES_SLACK_BOT_ID!

const POLL_INTERVAL_MS = 1_500
const POLL_TIMEOUT_MS  = 120_000   // 2 min — enough time to approve a permission prompt
const SETTLE_AFTER_MS  =   8_000   // no new text for 8 s = Hermes is done

// ─── Internal types ──────────────────────────────────────────────────────────

interface SlackMsg {
  ts:      string
  text:    string
  bot_id?: string
  blocks?: Array<{ type: string; text?: { text: string }; elements?: unknown[] }>
}

// ─── Helpers (previously inlined in app/api/chat/route.ts) ───────────────────

function isPermissionRequest(msg: SlackMsg): boolean {
  return (
    msg.text?.includes('Command Approval Required') ||
    msg.text?.includes('Approval Required') ||
    (msg.blocks ?? []).some(
      b =>
        b.text?.text?.includes('Command Approval Required') ||
        b.text?.text?.includes('Approval Required'),
    )
  )
}

function extractPermissionRequest(msg: SlackMsg, channel: string): PermissionRequest {
  const text       = msg.text ?? ''
  const cmdMatch   = text.match(/```([\s\S]*?)```/)
  const command    = cmdMatch ? cmdMatch[1].trim() : text
  const reasonMatch = text.match(/Reason:\s*([\s\S]*?)(?:\n\s*(?:Safer:|See (?:more|less))|$)/)
  const reason     = reasonMatch ? reasonMatch[1].trim() : ''
  return { ts: msg.ts, channel, command, reason }
}

async function getHermesMessages(channel: string, parentTs: string): Promise<SlackMsg[]> {
  const [threadRes, historyRes] = await Promise.all([
    fetch(
      `https://slack.com/api/conversations.replies?channel=${channel}&ts=${parentTs}&limit=50`,
      { headers: { Authorization: `Bearer ${BOT_TOKEN}` } },
    ),
    fetch(
      `https://slack.com/api/conversations.history?channel=${channel}&oldest=${parentTs}&limit=20&inclusive=false`,
      { headers: { Authorization: `Bearer ${BOT_TOKEN}` } },
    ),
  ])
  const [threadData, historyData] = await Promise.all([threadRes.json(), historyRes.json()])

  const threadMsgs: SlackMsg[] = (threadData.ok ? threadData.messages ?? [] : []).filter(
    (m: SlackMsg) => m.bot_id === HERMES_BOT_ID && m.ts !== parentTs,
  )
  const historyMsgs: SlackMsg[] = (historyData.ok ? historyData.messages ?? [] : []).filter(
    (m: SlackMsg) => m.bot_id === HERMES_BOT_ID,
  )

  const seen = new Set<string>()
  return [...threadMsgs, ...historyMsgs]
    .filter(m => { if (seen.has(m.ts)) return false; seen.add(m.ts); return true })
    .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts))
}

function buildFullText(msgs: SlackMsg[]): string {
  return msgs
    .filter(m => !isPermissionRequest(m))
    .map(m => m.text.replace(/<@[A-Z0-9]+>/g, '').trim())
    .filter(Boolean)
    .join('\n\n')
}

async function pollForReply(
  channel: string,
  parentTs: string,
  onPermissionRequest: (req: PermissionRequest) => void,
  onTextUpdate: (text: string) => void,
): Promise<string | null> {
  const deadline   = Date.now() + POLL_TIMEOUT_MS
  const seenPermTs = new Set<string>()
  let lastFullText = ''
  let lastNewAt    = 0

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    const msgs = await getHermesMessages(channel, parentTs)
    if (msgs.length === 0) continue

    for (const msg of msgs) {
      if (isPermissionRequest(msg) && !seenPermTs.has(msg.ts)) {
        seenPermTs.add(msg.ts)
        onPermissionRequest(extractPermissionRequest(msg, channel))
      }
    }

    const fullText = buildFullText(msgs)
    if (!fullText) continue

    if (fullText !== lastFullText) {
      lastFullText = fullText
      lastNewAt    = Date.now()
      onTextUpdate(fullText)
    } else if (lastNewAt > 0 && Date.now() - lastNewAt >= SETTLE_AFTER_MS) {
      return lastFullText
    }
  }

  return lastFullText || null
}

// ─── Transport implementation ─────────────────────────────────────────────────

export const slackTransport: HermesTransport = {
  async chatSend(opts: ChatSendOptions): Promise<string | null> {
    const post = await postToSlack(opts.text, opts.senderName, opts.agentId ?? 'general')
    return pollForReply(post.channel, post.ts, opts.onPermissionRequest, opts.onTextUpdate)
  },

  async kanbanComplete(taskId, result, senderName) {
    const suffix = result ? ` "${result}"` : ''
    await postToSlack(`/kanban complete ${taskId}${suffix}`, senderName).catch(() => {})
  },

  async kanbanBlock(taskId, reason, senderName) {
    const suffix = reason ? ` "${reason}"` : ''
    await postToSlack(`/kanban block ${taskId}${suffix}`, senderName).catch(() => {})
  },

  async kanbanComment(taskId, text, senderName) {
    await postToSlack(
      `/kanban comment ${taskId} "${text.replace(/"/g, '\\"')}"`,
      senderName,
    )
  },

  async modelSet(model) {
    await postToSlack(`/model ${model}`, 'Mission Control').catch(() => {})
  },

  async exec(command, senderName = 'Mission Control') {
    await postToSlack(command, senderName).catch(() => {})
    return undefined
  },
}
