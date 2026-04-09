import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, GetCommand, UpdateCommand, DeleteCommand } from '@/lib/dynamodb'
import type { Task } from '@/types/task'

interface Params {
  params: { id: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const cmd = new GetCommand({
      TableName: TABLES.tasks,
      Key: { taskId: params.id },
    })
    const result = await ddb.send(cmd)
    if (!result.Item) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    return NextResponse.json({ task: result.Item })
  } catch (err) {
    console.error('[api/tasks/[id] GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body: Partial<Task> = await req.json()
    const now = new Date().toISOString()

    const updateFields: Partial<Task> = { ...body, updatedAt: now }
    delete updateFields.taskId

    const updateExpressions: string[] = []
    const expressionAttributeValues: Record<string, unknown> = { ':updatedAt': now }
    const expressionAttributeNames: Record<string, string> = {}

    updateExpressions.push('#updatedAt = :updatedAt')
    expressionAttributeNames['#updatedAt'] = 'updatedAt'

    for (const [key, value] of Object.entries(updateFields)) {
      if (key === 'updatedAt') continue
      const safeKey = `#${key}`
      const safeVal = `:${key}`
      updateExpressions.push(`${safeKey} = ${safeVal}`)
      expressionAttributeNames[safeKey] = key
      expressionAttributeValues[safeVal] = value
    }

    const cmd = new UpdateCommand({
      TableName: TABLES.tasks,
      Key: { taskId: params.id },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    })

    const result = await ddb.send(cmd)
    return NextResponse.json({ task: result.Attributes })
  } catch (err) {
    console.error('[api/tasks/[id] PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const cmd = new DeleteCommand({
      TableName: TABLES.tasks,
      Key: { taskId: params.id },
    })
    await ddb.send(cmd)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/tasks/[id] DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
