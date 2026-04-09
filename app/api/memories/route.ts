import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, PutCommand, ScanCommand } from '@/lib/dynamodb'
import { v4 as uuid } from 'uuid'
import type { Memory } from '@/types/memory'
import { MOCK_MEMORIES } from '@/lib/mockData'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const source = searchParams.get('source')
  const search = searchParams.get('search')
  const limit = parseInt(searchParams.get('limit') || '100')

  try {
    const filterExpressions: string[] = []
    const expressionAttributeValues: Record<string, unknown> = {}
    const expressionAttributeNames: Record<string, string> = {}

    if (type) {
      filterExpressions.push('#t = :type')
      expressionAttributeNames['#t'] = 'type'
      expressionAttributeValues[':type'] = type
    }

    if (source) {
      filterExpressions.push('source = :source')
      expressionAttributeValues[':source'] = source
    }

    if (search) {
      filterExpressions.push('(contains(title, :search) OR contains(content, :search))')
      expressionAttributeValues[':search'] = search
    }

    const cmd = new ScanCommand({
      TableName: TABLES.memories,
      ...(filterExpressions.length > 0 && {
        FilterExpression: filterExpressions.join(' AND '),
        ExpressionAttributeValues: expressionAttributeValues,
        ...(Object.keys(expressionAttributeNames).length > 0 && { ExpressionAttributeNames: expressionAttributeNames }),
      }),
      Limit: limit,
    })

    const result = await ddb.send(cmd)
    return NextResponse.json({ memories: result.Items || [] })
  } catch (err) {
    console.error('[api/memories GET]', err)
    let memories = MOCK_MEMORIES
    if (type) memories = memories.filter(m => m.type === type as any)
    if (source) memories = memories.filter(m => m.source === source as any)
    if (search) memories = memories.filter(m => m.title.toLowerCase().includes(search.toLowerCase()) || m.content.toLowerCase().includes(search.toLowerCase()))
    return NextResponse.json({ memories, _mock: true })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const now = new Date().toISOString()
    const memory: Memory = {
      memoryId: `MEM-${uuid().slice(0, 8).toUpperCase()}`,
      createdAt: now,
      updatedAt: now,
      title: body.title || 'Untitled Memory',
      content: body.content || '',
      type: body.type || 'context',
      tags: body.tags || [],
      source: body.source || 'user',
      relevanceScore: body.relevanceScore ?? 0.7,
      version: 1,
      ...(body.relatedTaskIds && { relatedTaskIds: body.relatedTaskIds }),
    }

    const cmd = new PutCommand({
      TableName: TABLES.memories,
      Item: memory,
    })

    await ddb.send(cmd)
    return NextResponse.json({ memory }, { status: 201 })
  } catch (err) {
    console.error('[api/memories POST]', err)
    const now = new Date().toISOString()
    const memory: Memory = {
      memoryId: `MEM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      createdAt: now,
      updatedAt: now,
      title: 'New Memory',
      content: '',
      type: 'context',
      tags: [],
      source: 'user',
      relevanceScore: 0.7,
      version: 1,
    }
    return NextResponse.json({ memory, _mock: true }, { status: 201 })
  }
}
