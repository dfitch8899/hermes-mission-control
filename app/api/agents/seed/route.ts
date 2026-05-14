import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, QueryCommand, PutCommand } from '@/lib/dynamodb'
import { BUILTIN_AGENTS } from '@/types/agent'

/**
 * POST /api/agents/seed           — insert missing built-in agents
 * POST /api/agents/seed?force=1   — overwrite all built-in agents (re-seeds models/policy)
 */
export async function POST(req: NextRequest) {
  const force = new URL(req.url).searchParams.get('force') === '1'
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.agents,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'AGENT' },
    }))

    // Build a map of existing items so we can preserve user-edited fields on normal seed
    const existingMap = new Map(
      (result.Items ?? []).map((i) => [i.agentId as string, i])
    )

    const now     = new Date().toISOString()
    const seeded: string[] = []
    const updated: string[] = []

    for (const agent of BUILTIN_AGENTS) {
      const existing = existingMap.get(agent.agentId)

      if (!existing) {
        // New agent — insert fresh
        await ddb.send(new PutCommand({
          TableName: TABLES.agents,
          Item: { pk: 'AGENT', sk: `AGENT#${agent.agentId}`, ...agent, createdAt: now, updatedAt: now },
        }))
        seeded.push(agent.agentId)
      } else if (force) {
        // Force reseed — refresh only the model/policy fields from builtin
        // defaults. All user-edited surface fields (name, icon, color,
        // systemPrompt, description) are preserved by spreading existing
        // first. Previously this spread `...agent` AFTER existing which
        // reverted those edits.
        await ddb.send(new PutCommand({
          TableName: TABLES.agents,
          Item: {
            ...existing,
            pk: 'AGENT',
            sk: `AGENT#${agent.agentId}`,
            orchestratorModel:  agent.orchestratorModel,
            workerModel:        agent.workerModel,
            orchestratorPolicy: agent.orchestratorPolicy,
            updatedAt:          now,
          },
        }))
        updated.push(agent.agentId)
      }
    }

    return NextResponse.json({ seeded, updated, skipped: BUILTIN_AGENTS.length - seeded.length - updated.length })
  } catch (err) {
    console.error('[api/agents/seed POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
