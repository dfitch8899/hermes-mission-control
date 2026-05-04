export type KanbanStatus = 'triage' | 'todo' | 'ready' | 'running' | 'blocked' | 'done'

export const KANBAN_COLUMNS: Array<{ status: KanbanStatus; label: string; color: string }> = [
  { status: 'triage',  label: 'Triage',  color: '#859398' },
  { status: 'todo',    label: 'To Do',   color: '#3cd7ff' },
  { status: 'ready',   label: 'Ready',   color: '#5df6e0' },
  { status: 'running', label: 'Running', color: '#4ade80' },
  { status: 'blocked', label: 'Blocked', color: '#f97316' },
  { status: 'done',    label: 'Done',    color: '#a78bfa' },
]

export interface KanbanTask {
  taskId:         string
  title:          string
  body:           string
  status:         KanbanStatus
  assignee:       string        // agentId
  priority:       'low' | 'normal' | 'high'
  tenant?:        string
  workspaceType?: string
  parentIds:      string[]
  childIds:       string[]
  commentCount:   number
  createdAt:      string
  updatedAt:      string
  completedAt?:   string
  archivedAt?:    string
}

export interface KanbanComment {
  commentId: string
  body:      string
  author:    string
  ts:        string
}

export type KanbanEventKind = 'create' | 'move' | 'comment' | 'complete' | 'block' | 'unblock' | 'archive' | 'link'

export interface KanbanEvent {
  eventId: string
  taskId:  string
  kind:    KanbanEventKind
  actor:   string
  payload: Record<string, unknown>
  ts:      string
}
