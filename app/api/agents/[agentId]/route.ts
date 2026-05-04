import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, QueryCommand, PutCommand, UpdateCommand, DeleteCommand } from '@/lib/dynamodb'
import type { Agent } from '@/types/agent'

type Ctx = { params: { agentId: string } }

/** GET /api/agents/[agentId] */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { agentId } = params
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.agents,
      KeyConditionExpression: 'pk = :pk AND sk = :sk',
      ExpressionAttributeValues: { ':pk': 'AGENT', ':sk': `AGENT#${agentId}` },
    }))
    const item = (result.Items ?? [])[0]
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ agent: item as Agent })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** PATCH /api/agents/[agentId] — update mutable fields */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { agentId } = params
  try {
    const body = await req.json() as Partial<Agent>
    const now  = new Date().toISOString()

    const updates: Record<string, unknown> = { updatedAt: now }
    const allowed: Array<keyof Agent> = [
      'name', 'description', 'icon', 'color', 'systemPrompt',
      'orchestratorModel', 'workerModel', 'orchestratorPolicy',
    ]
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key]
    }

    const setExpr = Object.keys(updates)
      .map((k) => `#${k} = :${k}`)
      .join(', ')
    const exprNames  = Object.fromEntries(Object.keys(updates).map((k) => [`#${k}`, k]))
    const exprValues = Object.fromEntries(Object.keys(updates).map((k) => [`:${k}`, updates[k]]))

    await ddb.send(new UpdateCommand({
      TableName: TABLES.agents,
      Key: { pk: 'AGENT', sk: `AGENT#${agentId}` },
      UpdateExpression: `SET ${setExpr}`,
      ExpressionAttributeNames:  exprNames,
      ExpressionAttributeValues: exprValues,
    }))

    return NextResponse.json({ success: true, updatedAt: now })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** DELETE /api/agents/[agentId] — blocked for builtins */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { agentId } = params
  try {
    // Check if builtin before deleting
    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.agents,
      KeyConditionExpression: 'pk = :pk AND sk = :sk',
      ExpressionAttributeValues: { ':pk': 'AGENT', ':sk': `AGENT#${agentId}` },
    }))
    const item = (result.Items ?? [])[0]
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (item.isBuiltin) return NextResponse.json({ error: 'Built-in agents cannot be deleted' }, { status: 403 })

    await ddb.send(new DeleteCommand({
      TableName: TABLES.agents,
      Key: { pk: 'AGENT', sk: `AGENT#${agentId}` },
    }))

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
