/**
 * Hermes sync status + on-demand sync trigger.
 *
 * GET  /api/hermes/sync  → returns last sync metadata from DynamoDB
 * POST /api/hermes/sync  → sends a Slack message asking Hermes to run
 *                          the sync script, then returns updated metadata
 */
import { NextResponse } from 'next/server'
import { ddb, TABLES, GetCommand, PutCommand } from '@/lib/dynamodb'

const BOT_TOKEN      = process.env.SLACK_BOT_TOKEN!
const USER_TOKEN     = process.env.SLACK_USER_TOKEN!
const CHANNEL_ID     = process.env.HERMES_SLACK_CHANNEL_ID!
const HERMES_USER_ID = process.env.HERMES_SLACK_USER_ID!
const HERMES_BOT_ID  = process.env.HERMES_SLACK_BOT_ID!

const SYNC_META_ID   = '_HERMES_SYNC_META'
const SYNC_TIMEOUT   = 30_000   // ms to wait for Hermes to reply
const POLL_INTERVAL  =  2_000   // ms between polls

interface SyncMeta {
  lastSyncedAt: string | null
  skillCount: number
  memoryCount: number
}

async function getSyncMeta(): Promise<SyncMeta> {
  try {
    const res = await ddb.send(new GetCommand({
      TableName: TABLES.memories,
      Key: { memoryId: SYNC_META_ID },
    }))
    const item = res.Item as Record<string, unknown> | undefined
    if (!item) return { lastSyncedAt: null, skillCount: 0, memoryCount: 0 }
    return {
      lastSyncedAt: (item.updatedAt as string) ?? null,
      skillCount:   Number(item.skillCount  ?? 0),
      memoryCount:  Number(item.memoryCount ?? 0),
    }
  } catch {
    return { lastSyncedAt: null, skillCount: 0, memoryCount: 0 }
  }
}

export async function GET() {
  const meta = await getSyncMeta()
  return NextResponse.json(meta)
}

export async function POST() {
  // 1. Capture the current sync timestamp so we can detect a new sync
  const before = await getSyncMeta()
  const beforeTs = before.lastSyncedAt

  // 2. Post sync command to Slack
  const syncCommand = 'PYTHONPATH=/opt/data/lib:$PYTHONPATH python3 /opt/data/scripts/sync_to_mc.py'
  const message = `<@${HERMES_USER_ID}> [Mission Control SYNC] Please run this command and reply with the output:\n\`\`\`\n${syncCommand}\n\`\`\``

  let postRes
  try {
    postRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${USER_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: CHANNEL_ID, text: message, as_user: true }),
    })
    const postData = await postRes.json()
    if (!postData.ok) {
      return NextResponse.json({ error: `Slack post failed: ${postData.error}` }, { status: 500 })
    }
    const parentTs: string = postData.ts

    // 3. Poll for Hermes reply
    const deadline = Date.now() + SYNC_TIMEOUT
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL))

      const repliesRes = await fetch(
        `https://slack.com/api/conversations.replies?channel=${CHANNEL_ID}&ts=${parentTs}&limit=10`,
        { headers: { Authorization: `Bearer ${BOT_TOKEN}` } }
      )
      const repliesData = await repliesRes.json()
      if (!repliesData.ok) continue

      const msgs: Array<{ ts: string; bot_id?: string; text: string }> = repliesData.messages ?? []
      const hermesReplied = msgs.some(m => m.bot_id === HERMES_BOT_ID && m.ts !== parentTs)
      if (hermesReplied) break
    }
  } catch {
    // Even if Slack fails, fall through and return current meta
  }

  // 4. Read updated sync meta (Hermes may have already updated DynamoDB)
  const after = await getSyncMeta()

  return NextResponse.json({
    ...after,
    synced: after.lastSyncedAt !== beforeTs,
  })
}
