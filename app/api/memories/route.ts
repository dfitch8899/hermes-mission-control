import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, PutCommand, ScanCommand } from '@/lib/dynamodb'
import { v4 as uuid } from 'uuid'
import type { Memory } from '@/types/memory'
import { MOCK_MEMORIES } from '@/lib/mockData'

// Safety cap so a misconfigured caller can't spin DynamoDB indefinitely.
// One scan page is ~1 MB; 10 pages = up to 10 MB / ~10k items.
const MEMORIES_MAX_SCAN_PAGES = 10
const MEMORIES_DEFAULT_LIMIT = 100
const MEMORIES_MAX_LIMIT = 1000

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const source = searchParams.get('source')
  const search = searchParams.get('search')
  const rawLimit = parseInt(searchParams.get('limit') || String(MEMORIES_DEFAULT_LIMIT), 10)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MEMORIES_MAX_LIMIT)
    : MEMORIES_DEFAULT_LIMIT

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

    // DynamoDB applies `Limit` to the SCANNED items, not post-filter results.
    // Combining Limit + FilterExpression in a single page would silently drop
    // valid rows if the first page happens to scan past unfiltered items.
    // Instead, paginate through the table (capped) and apply our caller limit
    // after filtering. A GSI on `type` (sort by createdAt) would let us swap
    // this for a Query — tracked as future infra work.
    const memories: Memory[] = []
    let exclusiveStartKey: Record<string, unknown> | undefined
    let pagesScanned = 0
    do {
      const result = await ddb.send(new ScanCommand({
        TableName: TABLES.memories,
        ...(filterExpressions.length > 0 && {
          FilterExpression: filterExpressions.join(' AND '),
          ExpressionAttributeValues: expressionAttributeValues,
          ...(Object.keys(expressionAttributeNames).length > 0 && { ExpressionAttributeNames: expressionAttributeNames }),
        }),
        ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
      }))
      for (const item of (result.Items || []) as Memory[]) {
        if (item.memoryId === '_HERMES_SYNC_META') continue
        memories.push(item)
        if (memories.length >= limit) break
      }
      if (memories.length >= limit) break
      exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined
      pagesScanned += 1
    } while (exclusiveStartKey && pagesScanned < MEMORIES_MAX_SCAN_PAGES)

    return NextResponse.json({ memories })
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
