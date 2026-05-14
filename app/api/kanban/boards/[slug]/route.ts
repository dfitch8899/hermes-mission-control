import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, QueryCommand, DeleteCommand } from '@/lib/dynamodb'

const BOARD_META_PK = 'BOARD_META'

/** DELETE /api/kanban/boards/[slug]
 *
 * Removes the board metadata entry and all task items that live under that
 * board's partition key.  The "default" board cannot be deleted.
 */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const { slug } = params

  if (slug === 'default') {
    return NextResponse.json({ error: 'Cannot delete the default board' }, { status: 400 })
  }

  try {
    // 1. Delete board metadata row
    await ddb.send(new DeleteCommand({
      TableName: TABLES.kanban,
      Key: { pk: BOARD_META_PK, sk: `BOARD#${slug}` },
    }))

    // 2. Delete all tasks belonging to this board
    //    Query in pages of 25 and batch-delete (DynamoDB has no cascading delete)
    const boardPk = `BOARD#${slug}`
    let lastKey: Record<string, unknown> | undefined

    do {
      const res = await ddb.send(new QueryCommand({
        TableName: TABLES.kanban,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': boardPk },
        ProjectionExpression: 'pk, sk',
        Limit: 25,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }))

      for (const item of res.Items ?? []) {
        await ddb.send(new DeleteCommand({
          TableName: TABLES.kanban,
          Key: { pk: item.pk as string, sk: item.sk as string },
        }))
      }

      lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined
    } while (lastKey)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[api/kanban/boards/${slug} DELETE]`, err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
