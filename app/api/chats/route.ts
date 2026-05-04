import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, QueryCommand, PutCommand } from '@/lib/dynamodb'

export interface ChatSummary {
  chatId:    string
  title:     string
  preview:   string
  agentId:   string
  createdAt: string
  updatedAt: string
}

/** GET /api/chats — list all chats, newest-used first */
export async function GET() {
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.chats,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'CHATLIST' },
    }))

    const chats: ChatSummary[] = (result.Items ?? [])
      .map((item) => ({
        chatId:    item.chatId              as string,
        title:     item.title              as string,
        preview:   (item.preview           as string) || '',
        agentId:   (item.agentId           as string) || 'general',
        createdAt: item.createdAt          as string,
        updatedAt: item.updatedAt          as string,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    return NextResponse.json({ chats })
  } catch (err) {
    console.error('[api/chats GET]', err)
    return NextResponse.json({ chats: [] })
  }
}

/** POST /api/chats — create a new chat record */
export async function POST(req: NextRequest) {
  try {
    const body    = await req.json().catch(() => ({})) as Record<string, string>
    const now     = new Date().toISOString()
    const chatId  = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const title   = (body.title   ?? '').slice(0, 80) || 'New Chat'
    const preview = (body.preview ?? '').slice(0, 120)

    await ddb.send(new PutCommand({
      TableName: TABLES.chats,
      Item: { pk: 'CHATLIST', sk: `CHAT#${chatId}`, chatId, title, preview, createdAt: now, updatedAt: now },
    }))

    return NextResponse.json({ chatId, title, preview, createdAt: now, updatedAt: now }, { status: 201 })
  } catch (err) {
    console.error('[api/chats POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
