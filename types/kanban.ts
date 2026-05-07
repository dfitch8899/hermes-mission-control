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
  assignee:       string
  priority:       'low' | 'normal' | 'high' | 'critical'
  tenant?:        string
  workspaceType?: string
  tags?:          string[]
  parentIds:      string[]
  childIds:       string[]
  commentCount:   number
  boardSlug?:     string
  createdAt:      string
  updatedAt:      string
  completedAt?:   string
  archivedAt?:    string
  claimedBy?:     string
  claimedAt?:     string
  leaseExpiresAt?: string
  lastHeartbeatAt?: string
  attempt?:       number
  blockedReason?: string
  resultSummary?: string
  activeRunId?:   string
  lastRunStatus?: 'idle' | 'running' | 'blocked' | 'failed' | 'done'
  dependencyState?: 'clear' | 'waiting_on_parents'
  waitingOnTaskIds?: string[]
  latestHandoff?: {
    from: string
    to: string
    ts: string
    note?: string
  }
}

export interface KanbanComment {
  commentId: string
  body:      string
  author:    string
  ts:        string
}

export type KanbanEventKind = 'create' | 'move' | 'update' | 'comment' | 'complete' | 'block' | 'unblock' | 'archive' | 'link'

export interface KanbanEvent {
  eventId: string
  taskId:  string
  kind:    KanbanEventKind
  actor:   string
  payload: Record<string, unknown>
  ts:      string
}

export interface KanbanBoard {
  slug:      string
  name:      string
  createdAt: string
}
