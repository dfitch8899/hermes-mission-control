/**
 * Mission Control → Hermes Chat Relay
 *
 * Posts as a real user (xoxp-) so Hermes treats it as a human message.
 * Prefixes every message with "[Mission Control]" and the sender's name
 * so Hermes and Slack both know where it's coming from.
 * @mentions the Hermes bot so it always triggers a response.
 */

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

const BOT_TOKEN      = process.env.SLACK_BOT_TOKEN!
const USER_TOKEN     = process.env.SLACK_USER_TOKEN!
const CHANNEL_ID     = process.env.HERMES_SLACK_CHANNEL_ID!
const HERMES_BOT_ID  = process.env.HERMES_SLACK_BOT_ID!
const HERMES_USER_ID = process.env.HERMES_SLACK_USER_ID!  // for @mention

const POLL_INTERVAL_MS  = 1500
const POLL_TIMEOUT_MS   = 30000
const SETTLE_AFTER_MS   = 3500  // wait this long with no new Hermes messages before returning

async function postToSlack(text: string, senderName: string): Promise<{ ts: string; channel: string }> {
  // Format: "@Hermes Agent [Mission Control – Kyle] what tasks are pending?"
  // The @mention triggers app_mention event regardless of who's posting
  const formatted = `<@${HERMES_USER_ID}> [Mission Control${senderName ? ` – ${senderName}` : ''}] ${text}`

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${USER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel: CHANNEL_ID, text: formatted, as_user: true }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack post failed: ${data.error}`)
  return { ts: data.ts, channel: data.channel }
}

async function pollForReply(channel: string, parentTs: string): Promise<string | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  // Track the most recent Hermes reply so we return the *final* answer,
  // not the first "thinking" indicator (:clipboard: todo...) Hermes posts.
  let lastHermesTs   = ''
  let lastHermesText: string | null = null
  let lastNewAt      = 0  // wall-clock time when we last saw a NEW Hermes message

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    const res = await fetch(
      `https://slack.com/api/conversations.replies?channel=${channel}&ts=${parentTs}&limit=20`,
      { headers: { Authorization: `Bearer ${BOT_TOKEN}` } }
    )
    const data = await res.json()
    if (!data.ok) continue

    const messages: Array<{ ts: string; bot_id?: string; text: string }> = data.messages ?? []

    // Collect all Hermes replies in chronological order (skip the root message itself)
    const hermesReplies = messages.filter(
      m => m.bot_id === HERMES_BOT_ID && m.ts !== parentTs
    )
    if (hermesReplies.length === 0) continue

    // The last reply in the thread is the most recent message from Hermes
    const latest = hermesReplies[hermesReplies.length - 1]

    if (latest.ts !== lastHermesTs) {
      // A new (or first) Hermes message appeared — reset the settle timer
      lastHermesTs   = latest.ts
      lastHermesText = latest.text
      lastNewAt      = Date.now()
    } else if (lastNewAt > 0 && Date.now() - lastNewAt >= SETTLE_AFTER_MS) {
      // Hermes has stopped adding messages for SETTLE_AFTER_MS — it's done
      return lastHermesText
    }
  }

  // On timeout return whatever we collected (may be null if Hermes never replied)
  return lastHermesText
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json()

  // Get the logged-in user's name to attribute the message
  const session = await getServerSession(authOptions)
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
        const reply = await pollForReply(post.channel, post.ts)

        if (!reply) {
          send({
            type: 'text',
            delta: "Hermes didn't respond within 30 seconds — it may still be processing. Check Slack for the reply.",
          })
        } else {
          // Strip any Slack mention formatting from Hermes's reply before streaming
          const clean = reply.replace(/<@[A-Z0-9]+>/g, '').trim()
          for (const char of clean) {
            send({ type: 'text', delta: char })
          }
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
