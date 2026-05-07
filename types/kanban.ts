export type KanbanStatus = 'triage' | 'todo' | 'ready' | 'running' | 'blocked' | 'done'
export type KanbanBackend = 'legacy' | 'native'

export const KANBAN_COLUMNS: Array<{ status: KanbanStatus; label: string; color: string }> = [
  { status: 'triage',  label: 'Triage',  color: '#859398' },
  { status: 'todo',    label: 'To Do',   color: '#3cd7ff' },
  { status: 'ready',   label: 'Ready',   color: '#5df6e0' },
  { status: 'running', label: 'Running', color: '#4ade80' },
  { status: 'blocked', label: 'Blocked', color: '#f97316' },
  { status: 'done',    label: 'Done',    color: '#a78bfa' },
]

export interface KanbanTask {
  taskId:          string
  title:           string
  body:            string
  status:          KanbanStatus
  assignee:        string
  priority:        'low' | 'normal' | 'high' | 'critical'
  tenant?:         string
  workspaceType?:  string
  tags?:           string[]
  parentIds:       string[]
  childIds:        string[]
  parentCount?:    number
  childCount?:     number
  childProgress?:  { done: number; total: number }
  commentCount:    number
  boardSlug?:      string
  createdAt:       string
  updatedAt:       string
  completedAt?:    string
  archivedAt?:     string
  nativeStatus?:   string
  claimedBy?:      string
  claimedAt?:      string
  leaseExpiresAt?: string
  lastHeartbeatAt?: string
  attempt?:        number
  blockedReason?:  string
  resultSummary?:  string
  activeRunId?:    string
  lastRunStatus?:  'idle' | 'running' | 'blocked' | 'failed' | 'done'
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
  body: string
  author: string
  ts: string
}

export interface KanbanRun {
  runId: string
  profile?: string
  status?: string
  outcome?: string
  summary?: string
  error?: string
  metadata?: Record<string, unknown> | null
  startedAt?: string
  endedAt?: string
  heartbeatAt?: string
  claimExpiresAt?: string
}

export interface KanbanEvent {
  eventId: string
  taskId: string
  kind: string
  payload?: Record<string, unknown> | null
  ts: string
  runId?: string
}

export interface KanbanTaskLog {
  exists: boolean
  content: string
  truncated: boolean
  path?: string
  sizeBytes?: number
}

export interface KanbanBoard {
  slug: string
  name: string
  createdAt: string
  description?: string
  icon?: string
  color?: string
  archived?: boolean
  isCurrent?: boolean
  counts?: Record<string, number>
  total?: number
}
