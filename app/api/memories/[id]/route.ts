import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, GetCommand, UpdateCommand, DeleteCommand } from '@/lib/dynamodb'
import type { Memory } from '@/types/memory'

interface Params {
  params: { id: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const cmd = new GetCommand({
      TableName: TABLES.memories,
      Key: { memoryId: params.id },
    })
    const result = await ddb.send(cmd)
    if (!result.Item) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
    }
    return NextResponse.json({ memory: result.Item })
  } catch (err) {
    console.error('[api/memories/[id] GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body: Partial<Memory> = await req.json()
    const now = new Date().toISOString()

    const updateFields = { ...body, updatedAt: now }
    delete updateFields.memoryId

    const updateExpressions: string[] = []
    const expressionAttributeValues: Record<string, unknown> = { ':updatedAt': now }
    const expressionAttributeNames: Record<string, string> = { '#updatedAt': 'updatedAt' }

    updateExpressions.push('#updatedAt = :updatedAt')

    for (const [key, value] of Object.entries(updateFields)) {
      if (key === 'updatedAt') continue
      const safeKey = `#${key}`
      const safeVal = `:${key}`
      updateExpressions.push(`${safeKey} = ${safeVal}`)
      expressionAttributeNames[safeKey] = key
      expressionAttributeValues[safeVal] = value
    }

    const cmd = new UpdateCommand({
      TableName: TABLES.memories,
      Key: { memoryId: params.id },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    })

    const result = await ddb.send(cmd)
    return NextResponse.json({ memory: result.Attributes })
  } catch (err) {
    console.error('[api/memories/[id] PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const cmd = new DeleteCommand({
      TableName: TABLES.memories,
      Key: { memoryId: params.id },
    })
    await ddb.send(cmd)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/memories/[id] DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
