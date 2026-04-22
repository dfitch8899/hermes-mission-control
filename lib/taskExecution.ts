import type { Task } from '@/types/task'

export function buildTaskExecutionPrompt(task: Task): string {
  const lines = [
    `Carry out Mission Control task ${task.taskId}.`,
    '',
    `Title: ${task.title}`,
    `Description: ${task.description || 'No description provided.'}`,
    `Priority: ${task.priority}`,
    `Current status: ${task.status}`,
    `Assignee: ${task.assignee}`,
  ]

  if (task.tags.length > 0) {
    lines.push(`Tags: ${task.tags.join(', ')}`)
  }

  if (task.hermesNotes) {
    lines.push(`Existing Hermes notes: ${task.hermesNotes}`)
  }

  lines.push(
    '',
    'Please start executing this task now. If needed, update the task, create supporting tasks, and record important findings in memory. Keep me posted on what you did.'
  )

  return lines.join('\n')
}