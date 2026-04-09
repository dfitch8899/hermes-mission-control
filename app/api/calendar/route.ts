import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, PutCommand, ScanCommand } from '@/lib/dynamodb'
import { v4 as uuid } from 'uuid'
import type { CalendarEvent } from '@/types/calendar'
import { MOCK_CALENDAR_EVENTS } from '@/lib/mockData'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  try {
    const filterExpressions: string[] = []
    const expressionAttributeValues: Record<string, unknown> = {}
    const expressionAttributeNames: Record<string, string> = {}

    if (type) {
      filterExpressions.push('#t = :type')
      expressionAttributeNames['#t'] = 'type'
      expressionAttributeValues[':type'] = type
    }

    const cmd = new ScanCommand({
      TableName: TABLES.calendar,
      ...(filterExpressions.length > 0 && {
        FilterExpression: filterExpressions.join(' AND '),
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
      }),
    })

    const result = await ddb.send(cmd)
    return NextResponse.json({ events: result.Items || [] })
  } catch (err) {
    console.error('[api/calendar GET]', err)
    let events = MOCK_CALENDAR_EVENTS
    if (type) events = events.filter(e => e.type === type as any)
    return NextResponse.json({ events, _mock: true })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const now = new Date().toISOString()
    const event: CalendarEvent = {
      eventId: `EVT-${uuid().slice(0, 8).toUpperCase()}`,
      scheduledAt: body.scheduledAt || now,
      title: body.title || 'Untitled Event',
      type: body.type || 'planned',
      ...(body.cronExpression && { cronExpression: body.cronExpression }),
      ...(body.cronHumanReadable && { cronHumanReadable: body.cronHumanReadable }),
      nextRun: body.nextRun || now,
      ...(body.lastRun && { lastRun: body.lastRun }),
      lastRunStatus: body.lastRunStatus || 'never',
      ...(body.ecsTaskDefinition && { ecsTaskDefinition: body.ecsTaskDefinition }),
      ...(body.description && { description: body.description }),
      createdBy: body.createdBy || 'user',
    }

    const cmd = new PutCommand({
      TableName: TABLES.calendar,
      Item: event,
    })

    await ddb.send(cmd)
    return NextResponse.json({ event }, { status: 201 })
  } catch (err) {
    console.error('[api/calendar POST]', err)
    const body = await req.json().catch(() => ({}))
    const now = new Date().toISOString()
    const event: CalendarEvent = {
      eventId: `EVT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      scheduledAt: now,
      title: body.title || 'New Event',
      type: body.type || 'planned',
      nextRun: body.nextRun || now,
      lastRunStatus: 'never',
      createdBy: 'user',
    }
    return NextResponse.json({ event, _mock: true }, { status: 201 })
  }
}
