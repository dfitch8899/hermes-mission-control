import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-2' })
export const ddb = DynamoDBDocumentClient.from(client)

export const TABLES = {
  tasks: process.env.DYNAMODB_TABLE_TASKS || 'hermes-tasks',
  memories: process.env.DYNAMODB_TABLE_MEMORIES || 'hermes-memories',
  calendar: process.env.DYNAMODB_TABLE_CALENDAR || 'hermes-calendar',
  chats: process.env.DYNAMODB_TABLE_CHATS || 'hermes-chats',
  agents: process.env.DYNAMODB_TABLE_AGENTS || 'hermes-agents',
  kanban: process.env.DYNAMODB_TABLE_KANBAN || 'hermes-kanban',
}

export { GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand, QueryCommand }
