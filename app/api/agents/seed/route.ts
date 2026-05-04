import { NextResponse } from 'next/server'
import { ddb, TABLES, QueryCommand, PutCommand } from '@/lib/dynamodb'
import { BUILTIN_AGENTS } from '@/types/agent'

/** POST /api/agents/seed — idempotently insert the four built-in agents */
export async function POST() {
  try {
    // Check which builtins already exist
    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.agents,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'AGENT' },
    }))
    const existingIds = new Set((result.Items ?? []).map((i) => i.agentId as string))

    const now    = new Date().toISOString()
    const seeded: string[] = []

    for (const agent of BUILTIN_AGENTS) {
      if (!existingIds.has(agent.agentId)) {
        await ddb.send(new PutCommand({
          TableName: TABLES.agents,
          Item: {
            pk: 'AGENT',
            sk: `AGENT#${agent.agentId}`,
            ...agent,
            createdAt: now,
            updatedAt: now,
          },
        }))
        seeded.push(agent.agentId)
      }
    }

    return NextResponse.json({ seeded, already: BUILTIN_AGENTS.length - seeded.length })
  } catch (err) {
    console.error('[api/agents/seed POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
