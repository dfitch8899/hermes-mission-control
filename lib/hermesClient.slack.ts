/**
 * Slack-relay transport for the Hermes command client.
 *
 * Routes all Hermes interactions through the Slack channel, which Hermes's
 * gateway process monitors.  This is the legacy path and remains the fallback
 * while the direct-dashboard transport is not yet configured.
 */

import type { HermesTransport, ChatSendOptions, PermissionRequest } from './hermesClient.types'
import { postToSlack } from './slack'

const BOT_TOKEN     = process.env.SLACK_BOT_TOKEN     ?? ''
const HERMES_BOT_ID = process.env.HERMES_SLACK_BOT_ID ?? ''

function assertSlackConfigured(context: string): void {
  if (!BOT_TOKEN || !HERMES_BOT_ID) {
    throw new Error(
      `slackTransport.${context}: not configured — set SLACK_BOT_TOKEN and HERMES_SLACK_BOT_ID, ` +
      `or set HERMES_TRANSPORT=direct to bypass Slack`,
    )
  }
}

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
    assertSlackConfigured('chatSend')
    const post = await postToSlack(opts.text, opts.senderName, opts.agentId ?? 'general')
    return pollForReply(post.channel, post.ts, opts.onPermissionRequest, opts.onTextUpdate)
  },

  async kanbanCreate(_input) {
    // Same policy as kanbanComment / modelSet — kanban writes must never go
    // through the Slack relay, where the Hermes LLM would misinterpret the
    // structured payload as a chat message. Throw loudly so callers can fall
    // back to a user-visible error rather than silently dropping the task.
    throw new Error(
      'slackTransport.kanbanCreate is not supported — task creation requires the direct transport ' +
      '(set HERMES_TRANSPORT=direct)',
    )
  },

  async kanbanSetStatus(_taskId, _status, _board) {
    throw new Error(
      'slackTransport.kanbanSetStatus is not supported — status transitions require the direct transport ' +
      '(set HERMES_TRANSPORT=direct)',
    )
  },

  async kanbanSpecify(_taskId, _board) {
    throw new Error(
      'slackTransport.kanbanSpecify is not supported — the specifier endpoint requires the direct transport ' +
      '(set HERMES_TRANSPORT=direct)',
    )
  },

  async kanbanGetLog(_taskId, _opts) {
    throw new Error(
      'slackTransport.kanbanGetLog is not supported — the log endpoint requires the direct transport ' +
      '(set HERMES_TRANSPORT=direct)',
    )
  },

  async kanbanArchive(_taskId, _board) {
    throw new Error(
      'slackTransport.kanbanArchive is not supported — archiving requires the direct transport ' +
      '(set HERMES_TRANSPORT=direct)',
    )
  },

  async kanbanComplete(taskId, result, senderName) {
    assertSlackConfigured('kanbanComplete')
    const suffix = result ? ` "${result}"` : ''
    await postToSlack(`/kanban complete ${taskId}${suffix}`, senderName).catch(() => {})
  },

  async kanbanBlock(taskId, reason, senderName) {
    assertSlackConfigured('kanbanBlock')
    const suffix = reason ? ` "${reason}"` : ''
    await postToSlack(`/kanban block ${taskId}${suffix}`, senderName).catch(() => {})
  },

  async kanbanComment(taskId, text, senderName) {
    assertSlackConfigured('kanbanComment')
    await postToSlack(
      `/kanban comment ${taskId} "${text.replace(/"/g, '\\"')}"`,
      senderName,
    )
  },

  async modelSet(model) {
    assertSlackConfigured('modelSet')
    await postToSlack(`/model ${model}`, 'Mission Control').catch(() => {})
  },

  async exec(_command, _senderName) {
    // exec is direct-only per the transport policy in hermesClient.ts:
    //   "exec: ALWAYS direct — never Slack. If direct transport fails, the
    //   error surfaces in the terminal rather than leaking to the Slack
    //   channel."
    // Posting an exec command into the Slack chat would mis-route it as a
    // chat message to Hermes. Throw loudly if anyone routes here.
    throw new Error(
      'slackTransport.exec is not supported — exec always uses the direct transport ' +
      '(set HERMES_TRANSPORT=direct)',
    )
  },
}
