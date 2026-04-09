import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, GetCommand, UpdateCommand, DeleteCommand } from '@/lib/dynamodb'
import type { CalendarEvent } from '@/types/calendar'

interface Params {
  params: { id: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const cmd = new GetCommand({
      TableName: TABLES.calendar,
      Key: { eventId: params.id },
    })
    const result = await ddb.send(cmd)
    if (!result.Item) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    return NextResponse.json({ event: result.Item })
  } catch (err) {
    console.error('[api/calendar/[id] GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body: Partial<CalendarEvent> = await req.json()
    const updateFields = { ...body }
    delete updateFields.eventId

    const updateExpressions: string[] = []
    const expressionAttributeValues: Record<string, unknown> = {}
    const expressionAttributeNames: Record<string, string> = {}

    for (const [key, value] of Object.entries(updateFields)) {
      const safeKey = `#${key}`
      const safeVal = `:${key}`
      updateExpressions.push(`${safeKey} = ${safeVal}`)
      expressionAttributeNames[safeKey] = key
      expressionAttributeValues[safeVal] = value
    }

    if (updateExpressions.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const cmd = new UpdateCommand({
      TableName: TABLES.calendar,
      Key: { eventId: params.id },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    })

    const result = await ddb.send(cmd)
    return NextResponse.json({ event: result.Attributes })
  } catch (err) {
    console.error('[api/calendar/[id] PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const cmd = new DeleteCommand({
      TableName: TABLES.calendar,
      Key: { eventId: params.id },
    })
    await ddb.send(cmd)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/calendar/[id] DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
