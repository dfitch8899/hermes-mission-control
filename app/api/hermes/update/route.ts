import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, PutCommand, UpdateCommand } from '@/lib/dynamodb'
import { v4 as uuid } from 'uuid'

export async function POST(req: NextRequest) {
  // Validate Hermes API key
  const apiKey = req.headers.get('X-Hermes-Key')
  const expectedKey = process.env.HERMES_SECRET_KEY

  if (!expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { type, action, data } = body

    if (!type || !action || !data) {
      return NextResponse.json({ error: 'Missing required fields: type, action, data' }, { status: 400 })
    }

    const now = new Date().toISOString()
    let id: string

    if (type === 'task') {
      if (action === 'create') {
        id = `TX-${uuid().slice(0, 8).toUpperCase()}`
        await ddb.send(new PutCommand({
          TableName: TABLES.tasks,
          Item: {
            taskId: id,
            createdAt: now,
            updatedAt: now,
            source: 'hermes_auto',
            status: 'suggested',
            tags: [],
            ...data,
          },
        }))
      } else if (action === 'update' && data.taskId) {
        id = data.taskId
        const fields = { ...data, updatedAt: now }
        delete fields.taskId

        const updateExpressions: string[] = []
        const expressionAttributeValues: Record<string, unknown> = {}
        const expressionAttributeNames: Record<string, string> = {}

        for (const [key, value] of Object.entries(fields)) {
          const safeKey = `#${key}`
          const safeVal = `:${key}`
          updateExpressions.push(`${safeKey} = ${safeVal}`)
          expressionAttributeNames[safeKey] = key
          expressionAttributeValues[safeVal] = value
        }

        await ddb.send(new UpdateCommand({
          TableName: TABLES.tasks,
          Key: { taskId: id },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
        }))
      } else {
        return NextResponse.json({ error: 'Invalid action for type task' }, { status: 400 })
      }
    } else if (type === 'memory') {
      if (action === 'create') {
        id = `MEM-${uuid().slice(0, 8).toUpperCase()}`
        await ddb.send(new PutCommand({
          TableName: TABLES.memories,
          Item: {
            memoryId: id,
            createdAt: now,
            updatedAt: now,
            source: 'hermes',
            version: 1,
            relevanceScore: 0.8,
            tags: [],
            ...data,
          },
        }))
      } else if (action === 'update' && data.memoryId) {
        id = data.memoryId
        const fields = { ...data, updatedAt: now }
        delete fields.memoryId

        const updateExpressions: string[] = []
        const expressionAttributeValues: Record<string, unknown> = {}
        const expressionAttributeNames: Record<string, string> = {}

        for (const [key, value] of Object.entries(fields)) {
          const safeKey = `#${key}`
          const safeVal = `:${key}`
          updateExpressions.push(`${safeKey} = ${safeVal}`)
          expressionAttributeNames[safeKey] = key
          expressionAttributeValues[safeVal] = value
        }

        await ddb.send(new UpdateCommand({
          TableName: TABLES.memories,
          Key: { memoryId: id },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
        }))
      } else {
        return NextResponse.json({ error: 'Invalid action for type memory' }, { status: 400 })
      }
    } else if (type === 'calendar') {
      if (action === 'create') {
        id = `EVT-${uuid().slice(0, 8).toUpperCase()}`
        await ddb.send(new PutCommand({
          TableName: TABLES.calendar,
          Item: {
            eventId: id,
            scheduledAt: now,
            createdBy: 'hermes',
            lastRunStatus: 'never',
            ...data,
          },
        }))
      } else {
        return NextResponse.json({ error: 'Invalid action for type calendar' }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
    }

    return NextResponse.json({ success: true, id: id! })
  } catch (err) {
    console.error('[api/hermes/update POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
