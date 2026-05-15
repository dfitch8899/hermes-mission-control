import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, GetCommand, PutCommand } from '@/lib/dynamodb'
import { BUILTIN_AGENTS } from '@/types/agent'
import type { Agent } from '@/types/agent'
import { syncAgent } from '@/lib/hermesProfileSync'

type Ctx = { params: Promise<{ agentId: string }> }

/** POST /api/agents/[agentId]/reset
 *
 *  Restore a built-in agent (name, description, icon, color, systemPrompt,
 *  orchestratorModel, workerModel, orchestratorPolicy) to its canonical
 *  definition in `types/agent.ts → BUILTIN_AGENTS`. Preserves agentId,
 *  isBuiltin, and createdAt; refreshes updatedAt.
 *
 *  - 403 if the agent is not built-in (custom agents have no "defaults")
 *  - 404 if no agent or no canonical definition for that agentId
 */
export async function POST(_req: NextRequest, props: Ctx) {
  const { agentId } = await props.params
  try {
    const existingRes = await ddb.send(new GetCommand({
      TableName: TABLES.agents,
      Key: { pk: 'AGENT', sk: `AGENT#${agentId}` },
    }))
    const existing = existingRes.Item
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!existing.isBuiltin) {
      return NextResponse.json({ error: 'Only built-in agents can be reset' }, { status: 403 })
    }

    const canonical = BUILTIN_AGENTS.find(a => a.agentId === agentId)
    if (!canonical) {
      return NextResponse.json({ error: `No canonical definition for "${agentId}"` }, { status: 404 })
    }

    const now = new Date().toISOString()
    const agent: Agent = {
      ...canonical,
      createdAt: (existing.createdAt as string) ?? now,
      updatedAt: now,
    }

    await ddb.send(new PutCommand({
      TableName: TABLES.agents,
      Item: { pk: 'AGENT', sk: `AGENT#${agentId}`, ...agent },
    }))

    // Best-effort: push canonical prompt back to Hermes profile too.
    void syncAgent({ agentId, systemPrompt: agent.systemPrompt })

    return NextResponse.json({ agent })
  } catch (err) {
    console.error(`[api/agents/${agentId}/reset POST]`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
