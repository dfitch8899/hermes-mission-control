import { NextRequest, NextResponse } from 'next/server'
import { ddb, TABLES, GetCommand, UpdateCommand } from '@/lib/dynamodb'
import type { Task } from '@/types/task'
import { buildTaskExecutionPrompt } from '@/lib/taskExecution'
import { MOCK_TASKS } from '@/lib/mockData'

interface Params {
  params: { id: string }
}

function buildHermesNotes(existingNotes: string | undefined, timestamp: string): string {
  const note = `Execution requested from Mission Control at ${timestamp}.`
  return existingNotes ? `${existingNotes}\n\n${note}` : note
}

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const getResult = await ddb.send(new GetCommand({
      TableName: TABLES.tasks,
      Key: { taskId: params.id },
    }))

    const task = getResult.Item as Task | undefined

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task.status === 'done') {
      return NextResponse.json({ error: 'Completed tasks cannot be executed again.' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const nextTask: Task = {
      ...task,
      status: 'in_progress',
      assignee: task.assignee === 'both' ? 'both' : 'hermes',
      updatedAt: now,
      hermesNotes: buildHermesNotes(task.hermesNotes, now),
    }

    const result = await ddb.send(new UpdateCommand({
      TableName: TABLES.tasks,
      Key: { taskId: params.id },
      UpdateExpression: 'SET #status = :status, #assignee = :assignee, #updatedAt = :updatedAt, #hermesNotes = :hermesNotes',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#assignee': 'assignee',
        '#updatedAt': 'updatedAt',
        '#hermesNotes': 'hermesNotes',
      },
      ExpressionAttributeValues: {
        ':status': nextTask.status,
        ':assignee': nextTask.assignee,
        ':updatedAt': nextTask.updatedAt,
        ':hermesNotes': nextTask.hermesNotes,
      },
      ReturnValues: 'ALL_NEW',
    }))

    const updatedTask = (result.Attributes as Task | undefined) || nextTask

    return NextResponse.json({
      task: updatedTask,
      prompt: buildTaskExecutionPrompt(updatedTask),
    })
  } catch (err) {
    console.error('[api/tasks/[id]/execute POST]', err)

    const fallbackTask = MOCK_TASKS.find((candidate) => candidate.taskId === params.id)
    if (fallbackTask && fallbackTask.status !== 'done') {
      const now = new Date().toISOString()
      const updatedTask: Task = {
        ...fallbackTask,
        status: 'in_progress',
        assignee: fallbackTask.assignee === 'both' ? 'both' : 'hermes',
        updatedAt: now,
        hermesNotes: buildHermesNotes(fallbackTask.hermesNotes, now),
      }

      return NextResponse.json({
        task: updatedTask,
        prompt: buildTaskExecutionPrompt(updatedTask),
        persisted: false,
      })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}