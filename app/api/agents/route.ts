import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, QueryCommand, PutCommand } from '@/lib/dynamodb'
import type { Agent } from '@/types/agent'

/** GET /api/agents — list all agents, builtins first then alpha */
export async function GET() {
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.agents,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'AGENT' },
    }))

    const agents: Agent[] = (result.Items ?? [])
      .map((item) => ({
        agentId:            item.agentId            as string,
        name:               item.name               as string,
        description:        item.description        as string,
        icon:               item.icon               as string,
        color:              item.color              as string,
        systemPrompt:       item.systemPrompt       as string,
        orchestratorModel:  item.orchestratorModel  as string,
        workerModel:        item.workerModel        as string,
        orchestratorPolicy: item.orchestratorPolicy as Agent['orchestratorPolicy'],
        isBuiltin:          (item.isBuiltin as boolean) ?? false,
        createdAt:          item.createdAt          as string,
        updatedAt:          item.updatedAt          as string,
      }))
      .sort((a, b) => {
        if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    return NextResponse.json({ agents })
  } catch (err) {
    console.error('[api/agents GET]', err)
    return NextResponse.json({ agents: [] })
  }
}

/** POST /api/agents — create a user-defined agent */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<Agent>
    const now     = new Date().toISOString()
    const agentId = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    const agent: Agent = {
      agentId,
      name:               (body.name               ?? 'New Agent').slice(0, 60),
      description:        (body.description        ?? '').slice(0, 200),
      icon:               body.icon               ?? '🤖',
      color:              body.color              ?? '#3cd7ff',
      systemPrompt:       body.systemPrompt       ?? '',
      orchestratorModel:  body.orchestratorModel  ?? 'gpt-5.4',
      workerModel:        body.workerModel        ?? 'gpt-5.4',
      orchestratorPolicy: body.orchestratorPolicy ?? 'auto',
      isBuiltin:          false,
      createdAt:          now,
      updatedAt:          now,
    }

    await ddb.send(new PutCommand({
      TableName: TABLES.agents,
      Item: { pk: 'AGENT', sk: `AGENT#${agentId}`, ...agent },
    }))

    return NextResponse.json({ agent }, { status: 201 })
  } catch (err) {
    console.error('[api/agents POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
