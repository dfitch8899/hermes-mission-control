import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, GetCommand, PutCommand } from '@/lib/dynamodb'
import { hermesClient } from '@/lib/hermesClient'
import { CODEX_MODELS } from '@/lib/codexModels'

const SETTINGS_PK = 'SETTINGS'
const SETTINGS_SK = 'GLOBAL'

/** GET /api/hermes/model — current active Hermes model */
export async function GET() {
  try {
    const res = await ddb.send(new GetCommand({
      TableName: TABLES.agents,
      Key: { pk: SETTINGS_PK, sk: SETTINGS_SK },
    }))
    const activeModel = (res.Item?.activeModel as string) || 'gpt-5.5'
    return NextResponse.json({ model: activeModel, options: CODEX_MODELS })
  } catch (err) {
    console.error('[api/hermes/model GET]', err)
    // Return a safe default so the picker still renders
    return NextResponse.json({ model: 'gpt-5.5', options: CODEX_MODELS })
  }
}

/** POST /api/hermes/model  body: { model: string }
 *  1. Validates model name is in the known list
 *  2. Persists selection to DynamoDB (read by orchestrator as override)
 *  3. Sends /model <name> to Hermes via Slack bridge so config.yaml is updated live
 */
export async function POST(req: NextRequest) {
  try {
    const { model } = await req.json() as { model: string }
    const validModels = CODEX_MODELS.map(m => m.value)
    if (!model || !validModels.includes(model as typeof validModels[number])) {
      return NextResponse.json({ error: `Unknown model. Valid options: ${validModels.join(', ')}` }, { status: 400 })
    }

    const now = new Date().toISOString()

    // 1. Persist to DynamoDB — orchestrator.py reads this via _active_model()
    await ddb.send(new PutCommand({
      TableName: TABLES.agents,
      Item: { pk: SETTINGS_PK, sk: SETTINGS_SK, activeModel: model, updatedAt: now },
    }))

    // 2. Tell Hermes to update config.yaml live — best-effort via hermesClient.
    await hermesClient.modelSet(model).catch(
      (err) => console.warn('[api/hermes/model] hermesClient.modelSet failed (non-fatal):', err),
    )

    return NextResponse.json({ ok: true, model })
  } catch (err) {
    console.error('[api/hermes/model POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
