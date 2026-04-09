export type TaskStatus = 'suggested' | 'queued' | 'in_progress' | 'done' | 'possible'
export type TaskAssignee = 'hermes' | 'human' | 'both'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

export type Task = {
  taskId: string
  createdAt: string
  title: string
  description: string
  status: TaskStatus
  assignee: TaskAssignee
  assigneeUserId?: string
  priority: TaskPriority
  source: 'manual' | 'hermes_auto'
  tags: string[]
  updatedAt: string
  completedAt?: string
  hermesNotes?: string
  relatedMemoryIds?: string[]
}
