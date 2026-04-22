import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

const BOT_TOKEN      = process.env.SLACK_BOT_TOKEN!
const USER_TOKEN     = process.env.SLACK_USER_TOKEN!
const CHANNEL_ID     = process.env.HERMES_SLACK_CHANNEL_ID!
const HERMES_BOT_ID  = process.env.HERMES_SLACK_BOT_ID!
const HERMES_USER_ID = process.env.HERMES_SLACK_USER_ID!

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS  = 120_000  // 2 min — enough time to approve a permission prompt
const SETTLE_AFTER_MS  = 8000     // no new text for 8s = Hermes is done

interface HermesMsg {
  ts: string
  text: string
  bot_id?: string
  blocks?: Array<{ type: string; text?: { text: string }; elements?: unknown[] }>
}

export interface PermissionRequest {
  ts: string
  channel: string
  command: string
  reason: string
}

function isPermissionRequest(msg: HermesMsg): boolean {
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

function extractPermissionRequest(msg: HermesMsg, channel: string): PermissionRequest {
  const text = msg.text ?? ''
  const cmdMatch = text.match(/```([\s\S]*?)```/)
  const command = cmdMatch ? cmdMatch[1].trim() : text

  const reasonMatch = text.match(/Reason:\s*([\s\S]*?)(?:\n\s*(?:Safer:|See (?:more|less))|$)/)
  const reason = reasonMatch ? reasonMatch[1].trim() : ''

  return { ts: msg.ts, channel, command, reason }
}

async function postToSlack(text: string, senderName: string): Promise<{ ts: string; channel: string }> {
  const formatted = `<@${HERMES_USER_ID}> [Mission Control${senderName ? ` – ${senderName}` : ''}] ${text}`
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${USER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: CHANNEL_ID, text: formatted, as_user: true }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack post failed: ${data.error}`)
  return { ts: data.ts, channel: data.channel }
}

async function getHermesMessages(channel: string, parentTs: string): Promise<HermesMsg[]> {
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

  const threadMsgs: HermesMsg[] = (threadData.ok ? threadData.messages ?? [] : []).filter(
    (m: HermesMsg) => m.bot_id === HERMES_BOT_ID && m.ts !== parentTs,
  )
  const historyMsgs: HermesMsg[] = (historyData.ok ? historyData.messages ?? [] : []).filter(
    (m: HermesMsg) => m.bot_id === HERMES_BOT_ID,
  )

  const seen = new Set<string>()
  return [...threadMsgs, ...historyMsgs]
    .filter(m => { if (seen.has(m.ts)) return false; seen.add(m.ts); return true })
    .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts))
}

/**
 * Build a single text blob from all normal (non-permission) Hermes messages.
 * Handles Hermes editing a single message OR posting multiple messages.
 */
function buildFullText(msgs: HermesMsg[]): string {
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

    // Emit newly-seen permission requests
    for (const msg of msgs) {
      if (isPermissionRequest(msg) && !seenPermTs.has(msg.ts)) {
        seenPermTs.add(msg.ts)
        onPermissionRequest(extractPermissionRequest(msg, channel))
      }
    }

    // Build the complete text from all normal messages (handles single editable msg + multi-msg)
    const fullText = buildFullText(msgs)
    if (!fullText) continue

    if (fullText !== lastFullText) {
      // Hermes has new or updated content — reset settle timer and stream the update
      lastFullText = fullText
      lastNewAt    = Date.now()
      onTextUpdate(fullText)
    } else if (lastNewAt > 0 && Date.now() - lastNewAt >= SETTLE_AFTER_MS) {
      // Content hasn't changed in SETTLE_AFTER_MS — Hermes is done
      return lastFullText
    }
  }

  return lastFullText || null
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json()

  const session    = await getServerSession(authOptions)
  const senderName = session?.user?.name ?? session?.user?.email ?? ''

  const lastUser = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
  if (!lastUser) return new Response(JSON.stringify({ error: 'No user message' }), { status: 400 })

  const userText = typeof lastUser.content === 'string'
    ? lastUser.content
    : lastUser.content?.map((b: { text?: string }) => b.text).join(' ')

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
        send({ type: 'status', message: 'Sending to Hermes...' })
        const post = await postToSlack(userText, senderName)

        send({ type: 'status', message: 'Waiting for Hermes...' })

        const reply = await pollForReply(
          post.channel,
          post.ts,
          // permission_request callback
          (permReq) => {
            send({
              type: 'permission_request',
              ts:      permReq.ts,
              channel: permReq.channel,
              command: permReq.command,
              reason:  permReq.reason,
            })
          },
          // text update callback — stream the full current text so the UI can replace in real-time
          (fullText) => {
            send({ type: 'text_replace', text: fullText })
          },
        )

        if (!reply) {
          send({
            type: 'text_replace',
            text: "Hermes didn't respond within 2 minutes — it may still be processing. Check Slack for the reply.",
          })
        }

        send({ type: 'done' })
      } catch (err) {
        send({ type: 'error', message: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
