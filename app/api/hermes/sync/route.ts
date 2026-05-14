/**
 * Hermes sync status + on-demand sync trigger.
 *
 * GET  /api/hermes/sync  → returns last sync metadata from DynamoDB
 * POST /api/hermes/sync  → tells Hermes to run sync_to_mc.py via hermesClient.exec(),
 *                          then returns updated metadata
 *
 * hermesClient.exec() uses the direct dashboard transport when HERMES_TRANSPORT=direct,
 * falling back to the Slack relay otherwise.
 */
import { NextResponse } from 'next/server'
import { ddb, TABLES, GetCommand } from '@/lib/dynamodb'
import { hermesClient } from '@/lib/hermesClient'

const SYNC_TIMEOUT  = 30_000   // ms to wait for DynamoDB to reflect the new sync
const POLL_INTERVAL =  2_000   // ms between polls

const SYNC_META_ID = '_HERMES_SYNC_META'

interface SyncMeta {
  lastSyncedAt: string | null
  skillCount:   number
  memoryCount:  number
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
      lastSyncedAt: (item.updatedAt  as string) ?? null,
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
  // 1. Capture current sync timestamp so we can detect when a new sync lands
  const before    = await getSyncMeta()
  const beforeTs  = before.lastSyncedAt

  // 2. Ask Hermes to run the sync script via hermesClient.exec()
  //    Falls back to Slack relay when HERMES_TRANSPORT is not "direct".
  const syncCommand = 'PYTHONPATH=/opt/data/lib:$PYTHONPATH python3 /opt/data/scripts/sync_to_mc.py'
  let triggerError: string | null = null
  try {
    await hermesClient.exec(syncCommand, 'Mission Control')
  } catch (err) {
    // Common failure modes here:
    //   - HERMES_TRANSPORT != 'direct' (exec is direct-only)
    //   - Hermes endpoint unreachable / draining
    //   - sync_to_mc.py errored out (non-zero exit)
    // All of these mean "no point waiting 30s for a sync that never ran".
    triggerError = err instanceof Error ? err.message : String(err)
    console.warn('[api/hermes/sync] exec failed:', triggerError)
  }

  // 3. Poll DynamoDB until the timestamp advances or we time out.
  //    Short-circuit when we know the trigger never ran — saves 30s of UI
  //    spinner with no chance of seeing a result.
  let after = before
  if (!triggerError) {
    const deadline = Date.now() + SYNC_TIMEOUT
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL))
      after = await getSyncMeta()
      if (after.lastSyncedAt !== beforeTs) break
    }
  }

  return NextResponse.json({
    ...after,
    synced: after.lastSyncedAt !== beforeTs,
    ...(triggerError ? { triggerError } : {}),
  })
}
