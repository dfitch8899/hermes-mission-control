import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, QueryCommand, GetCommand, DeleteCommand } from '@/lib/dynamodb'

/** GET /api/chats/[chatId] — fetch all messages for a chat */
export async function GET(
  _req: NextRequest,
  { params }: { params: { chatId: string } },
) {
  const { chatId } = params
  try {
    const [msgResult, chatItem] = await Promise.all([
      ddb.send(new QueryCommand({
        TableName: TABLES.chats,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': `CHAT#${chatId}` },
        ScanIndexForward: true, // oldest message first
      })),
      ddb.send(new GetCommand({
        TableName: TABLES.chats,
        Key: { pk: 'CHATLIST', sk: `CHAT#${chatId}` },
      })),
    ])

    const messages = (msgResult.Items ?? []).map((item) => ({
      id:          item.messageId as string,
      role:        item.role      as 'user' | 'assistant',
      content:     item.content   as string,
      toolCalls:   (item.toolCalls   as unknown[]) ?? [],
      permissions: (item.permissions as unknown[]) ?? [],
    }))

    const agentId = (chatItem.Item?.agentId as string) || 'general'

    return NextResponse.json({ messages, agentId })
  } catch (err) {
    console.error(`[api/chats/${chatId} GET]`, err)
    return NextResponse.json({ messages: [], agentId: 'general' })
  }
}

/** DELETE /api/chats/[chatId] — remove chat + all its messages */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { chatId: string } },
) {
  const { chatId } = params
  try {
    // Delete all message items
    const msgResult = await ddb.send(new QueryCommand({
      TableName: TABLES.chats,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `CHAT#${chatId}` },
    }))
    await Promise.all(
      (msgResult.Items ?? []).map((item) =>
        ddb.send(new DeleteCommand({
          TableName: TABLES.chats,
          Key: { pk: item.pk as string, sk: item.sk as string },
        })),
      ),
    )

    // Delete the CHATLIST entry
    await ddb.send(new DeleteCommand({
      TableName: TABLES.chats,
      Key: { pk: 'CHATLIST', sk: `CHAT#${chatId}` },
    }))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(`[api/chats/${chatId} DELETE]`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
