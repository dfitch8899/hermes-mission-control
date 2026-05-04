import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { ddb, TABLES, PutCommand, UpdateCommand } from '@/lib/dynamodb'
import { postToSlack } from '@/lib/slack'

const BOT_TOKEN     = process.env.SLACK_BOT_TOKEN!
const HERMES_BOT_ID = process.env.HERMES_SLACK_BOT_ID!

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

// ─── DynamoDB helpers ──────────────────────────────────────────────────────

/** Create a new chat record and return its chatId */
async function createChatRecord(firstMessage: string, agentId?: string): Promise<string> {
  const now    = new Date().toISOString()
  const chatId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const title  = firstMessage.slice(0, 80) + (firstMessage.length > 80 ? '…' : '')
  const preview = firstMessage.slice(0, 120)

  await ddb.send(new PutCommand({
    TableName: TABLES.chats,
    Item: { pk: 'CHATLIST', sk: `CHAT#${chatId}`, chatId, title, preview, createdAt: now, updatedAt: now, agentId: agentId ?? 'general' },
  }))
  return chatId
}

/** Append a message to a chat */
async function saveMessageRecord(chatId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  const now     = new Date().toISOString()
  const msgId   = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const sk      = `MSG#${now}#${msgId}`

  await ddb.send(new PutCommand({
    TableName: TABLES.chats,
    Item: { pk: `CHAT#${chatId}`, sk, messageId: msgId, role, content, timestamp: now },
  }))
}

/** Update updatedAt and preview for the CHATLIST entry */
async function updateChatRecord(chatId: string, preview: string): Promise<void> {
  const now = new Date().toISOString()
  await ddb.send(new UpdateCommand({
    TableName: TABLES.chats,
    Key: { pk: 'CHATLIST', sk: `CHAT#${chatId}` },
    UpdateExpression: 'SET updatedAt = :now, preview = :preview',
    ExpressionAttributeValues: { ':now': now, ':preview': preview.slice(0, 120) },
  }))
}

// ─── Slack helpers ─────────────────────────────────────────────────────────

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

// ─── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { messages, chatId: incomingChatId, agentId } = body as {
    messages: Array<{ role: string; content: string }>
    chatId?:  string | null
    agentId?: string | null
  }

  const session    = await getServerSession(authOptions)
  const senderName = session?.user?.name ?? session?.user?.email ?? ''

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUser) return new Response(JSON.stringify({ error: 'No user message' }), { status: 400 })

  const userText = typeof lastUser.content === 'string'
    ? lastUser.content
    : (lastUser.content as Array<{ text?: string }>)?.map(b => b.text).join(' ')

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      let chatId = incomingChatId ?? null

      try {
        // Ensure a chat record exists ─────────────────────────────────────
        if (!chatId) {
          chatId = await createChatRecord(userText, agentId ?? 'general').catch(() => null)
          if (chatId) send({ type: 'chat_meta', chatId })
        }

        // Persist user message ────────────────────────────────────────────
        if (chatId) {
          await saveMessageRecord(chatId, 'user', userText).catch(() => {/* non-fatal */})
        }

        // Stream Hermes reply ─────────────────────────────────────────────
        send({ type: 'status', message: 'Sending to Hermes...' })
        const post = await postToSlack(userText, senderName, agentId ?? 'general')

        send({ type: 'status', message: 'Waiting for Hermes...' })

        const reply = await pollForReply(
          post.channel,
          post.ts,
          (permReq) => {
            send({
              type:    'permission_request',
              ts:      permReq.ts,
              channel: permReq.channel,
              command: permReq.command,
              reason:  permReq.reason,
            })
          },
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

        // Persist assistant reply ─────────────────────────────────────────
        if (chatId && reply) {
          await saveMessageRecord(chatId, 'assistant', reply).catch(() => {/* non-fatal */})
          await updateChatRecord(chatId, reply).catch(() => {/* non-fatal */})
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
