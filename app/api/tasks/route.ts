import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, PutCommand, ScanCommand } from '@/lib/dynamodb'
import { v4 as uuid } from 'uuid'
import type { Task } from '@/types/task'
import { MOCK_TASKS } from '@/lib/mockData'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const assignee = searchParams.get('assignee')
  const search = searchParams.get('search')
  const limit = parseInt(searchParams.get('limit') || '100')

  try {
    const filterExpressions: string[] = []
    const expressionAttributeValues: Record<string, unknown> = {}
    const expressionAttributeNames: Record<string, string> = {}

    if (status) {
      filterExpressions.push('#s = :status')
      expressionAttributeNames['#s'] = 'status'
      expressionAttributeValues[':status'] = status
    }

    if (assignee) {
      filterExpressions.push('assignee = :assignee')
      expressionAttributeValues[':assignee'] = assignee
    }

    if (search) {
      filterExpressions.push('contains(title, :search)')
      expressionAttributeValues[':search'] = search
    }

    const cmd = new ScanCommand({
      TableName: TABLES.tasks,
      ...(filterExpressions.length > 0 && {
        FilterExpression: filterExpressions.join(' AND '),
        ExpressionAttributeValues: expressionAttributeValues,
        ...(Object.keys(expressionAttributeNames).length > 0 && { ExpressionAttributeNames: expressionAttributeNames }),
      }),
      Limit: limit,
    })

    const result = await ddb.send(cmd)
    return NextResponse.json({ tasks: result.Items || [] })
  } catch (err) {
    console.error('[api/tasks GET]', err)
    // Return mock data as fallback
    let tasks = MOCK_TASKS
    if (status) tasks = tasks.filter(t => t.status === status)
    if (assignee) tasks = tasks.filter(t => t.assignee === assignee)
    if (search) tasks = tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    return NextResponse.json({ tasks, _mock: true })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const now = new Date().toISOString()
    const task: Task = {
      taskId: `TX-${uuid().slice(0, 8).toUpperCase()}`,
      createdAt: now,
      updatedAt: now,
      title: body.title || 'Untitled Task',
      description: body.description || '',
      status: body.status || 'queued',
      assignee: body.assignee || 'human',
      priority: body.priority || 'medium',
      source: body.source || 'manual',
      tags: body.tags || [],
      ...(body.hermesNotes && { hermesNotes: body.hermesNotes }),
      ...(body.relatedMemoryIds && { relatedMemoryIds: body.relatedMemoryIds }),
    }

    const cmd = new PutCommand({
      TableName: TABLES.tasks,
      Item: task,
    })

    await ddb.send(cmd)
    return NextResponse.json({ task }, { status: 201 })
  } catch (err) {
    console.error('[api/tasks POST]', err)
    // Return a mock created task
    const now = new Date().toISOString()
    const body = await req.json().catch(() => ({}))
    const task: Task = {
      taskId: `TX-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      createdAt: now,
      updatedAt: now,
      title: 'New Task',
      description: '',
      status: 'queued',
      assignee: 'human',
      priority: 'medium',
      source: 'manual',
      tags: [],
    }
    return NextResponse.json({ task, _mock: true }, { status: 201 })
  }
}
