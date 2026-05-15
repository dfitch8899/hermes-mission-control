import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { ddb, TABLES, PutCommand, UpdateCommand, GetCommand } from '@/lib/dynamodb'
import { hermesClient } from '@/lib/hermesClient'
import type { PermissionRequest } from '@/lib/hermesClient'
import { syncAgentSoul, type SyncResult } from '@/lib/hermesProfileSync'
import type { Agent } from '@/types/agent'

export type { PermissionRequest }

// ─── DynamoDB helpers ──────────────────────────────────────────────────────

/** Create a new chat record and return its chatId */
async function createChatRecord(firstMessage: string, agentId?: string): Promise<string> {
  const now    = new Date().toISOString()
  const chatId = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
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
  const now   = new Date().toISOString()
  const msgId = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
  const sk    = `MSG#${now}#${msgId}`

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

      let chatId       = incomingChatId ?? null
      let replyStarted = false

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

        // Apply the selected agent's systemPrompt to Hermes's active SOUL
        // before sending. Hermes hot-reloads SOUL.md on every message, so
        // this is the minimum-viable bridge to actually drive chat behavior
        // by the selected agent's customizations.
        //
        // Hard 3s timeout on the bridge: if Hermes is briefly unreachable
        // we should NOT keep the user waiting 15s before the chat even
        // starts. The chat itself has its own 2-minute timeout downstream.
        //
        // Limitations (acceptable for single-user MC, documented for future):
        //   • Two concurrent chats with different agentIds would race on
        //     /opt/data/SOUL.md. MC is currently single-user (basic-auth gate),
        //     so this isn't observable today.
        //   • Best-effort: errors here never block the chat — see the catch.
        const selectedAgentId = agentId ?? 'general'
        try {
          const a = await ddb.send(new GetCommand({
            TableName: TABLES.agents,
            Key: { pk: 'AGENT', sk: `AGENT#${selectedAgentId}` },
          }))
          const prompt = (a.Item as Agent | undefined)?.systemPrompt ?? ''
          // Write to the "default" profile because that's what /api/mc/chat
          // loads at request time. See docs/hermes-profile-sync.md.
          // Race against a 3s cap so a stuck Hermes can't block the chat.
          const syncRes = await Promise.race<SyncResult>([
            syncAgentSoul('default', prompt),
            new Promise<SyncResult>(resolve => setTimeout(
              () => resolve({ ok: false, status: 'network_error', detail: 'bridge timeout in chat path (>3s)' }),
              3_000,
            )),
          ])
          if (!syncRes.ok) {
            console.warn(
              `[chat] could not apply agent "${selectedAgentId}" SOUL to default: ${syncRes.status} ${syncRes.detail ?? ''}`
            )
          }
        } catch (err) {
          console.warn('[chat] agent SOUL apply skipped:', (err as Error).message ?? err)
        }

        // Stream Hermes reply via hermesClient ────────────────────────────
        send({ type: 'status', message: 'Sending to Hermes...' })

        const reply = await hermesClient.chatSend({
          text:      userText,
          senderName,
          agentId:   selectedAgentId,
          onPermissionRequest: (permReq) => {
            send({
              type:    'permission_request',
              ts:      permReq.ts,
              channel: permReq.channel,
              command: permReq.command,
              reason:  permReq.reason,
            })
          },
          onTextUpdate: (fullText) => {
            if (!replyStarted) {
              send({ type: 'status', message: 'Waiting for Hermes...' })
              replyStarted = true
            }
            send({ type: 'text_replace', text: fullText })
          },
        })

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
      Connection:      'keep-alive',
    },
  })
}
