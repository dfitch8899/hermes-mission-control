import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

const USER_TOKEN = process.env.SLACK_USER_TOKEN!

// Optional: if set, POSTs directly to Hermes's Slack interactive endpoint
// (same URL Slack would call when a button is clicked)
const HERMES_ACTION_URL = process.env.HERMES_ACTION_URL

export async function POST(req: NextRequest) {
  const { channel, messageTs, decision } = await req.json()

  if (!channel || !messageTs || !decision) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const session = await getServerSession(authOptions)
  const userId   = (session?.user as { slackId?: string })?.slackId ?? ''
  const userName = session?.user?.name ?? session?.user?.email ?? 'Mission Control'

  if (HERMES_ACTION_URL) {
    // Mimic the payload Slack sends when a button is clicked
    const payload = {
      type: 'block_actions',
      user: { id: userId, username: userName, name: userName },
      channel: { id: channel },
      message: { ts: messageTs },
      actions: [
        {
          action_id: decision,
          block_id: 'approval',
          value: decision,
          type: 'button',
        },
      ],
    }

    await fetch(HERMES_ACTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `payload=${encodeURIComponent(JSON.stringify(payload))}`,
    })
  } else {
    // Fallback: reply in the thread with the decision text
    // Hermes listens for thread replies as a fallback approval mechanism
    const text = decision === 'approve' ? 'approve' : 'deny'
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${USER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        thread_ts: messageTs,
        text: `[Mission Control – ${userName}] ${text}`,
        as_user: true,
      }),
    })
    const data = await res.json()
    if (!data.ok) {
      return Response.json({ error: `Slack error: ${data.error}` }, { status: 500 })
    }
  }

  return Response.json({ ok: true })
}
