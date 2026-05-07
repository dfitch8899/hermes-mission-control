import { randomBytes } from 'crypto'
import { ddb, TABLES, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@/lib/dynamodb'
import { hermesClient } from '@/lib/hermesClient'
import { hermesConfig, type HermesKanbanMode } from '@/lib/config'
import type { KanbanComment, KanbanTask, KanbanStatus } from '@/types/kanban'

export type KanbanBackend = 'legacy' | 'native'

interface ListTasksOptions {
  board?: string
  status?: KanbanStatus | null
  assignee?: string | null
  search?: string | null
  includeArchived?: boolean
}

interface GetTaskOptions {
  board?: string
}

interface CreateTaskInput {
  title: string
  description?: string
  assignee?: string
  priority?: string
  workspaceType?: string
  tenant?: string
  tags?: string[]
  board?: string
}

interface UpdateTaskInput {
  status?: string
  reason?: string
  result?: string
  assignee?: string
  archived?: boolean
  title?: string
  priority?: string
}

interface NativeTaskPayload {
  id: string
  title: string
  body?: string | null
  assignee?: string | null
  status: string
  priority?: number | null
  tenant?: string | null
  workspace_kind?: string | null
  created_at?: number | null
  started_at?: number | null
  completed_at?: number | null
  claim_expires?: number | null
  last_heartbeat_at?: number | null
  current_run_id?: number | null
  result?: string | null
}

interface NativeCommentPayload {
  id: number | string
  body: string
  author?: string | null
  created_at?: number | null
}

interface NativeEventPayload {
  kind: string
  payload?: Record<string, unknown> | null
  created_at?: number | null
}

interface NativeRunPayload {
  id: number
  profile?: string | null
  status?: string | null
  started_at?: number | null
  ended_at?: number | null
  last_heartbeat_at?: number | null
  claim_expires?: number | null
  summary?: string | null
  outcome?: string | null
}

interface NativeTaskDetailResponse {
  task: NativeTaskPayload
  comments?: NativeCommentPayload[]
  events?: NativeEventPayload[]
  links?: { parents?: string[]; children?: string[] }
  runs?: NativeRunPayload[]
}

function boardPk(slug: string) {
  return `BOARD#${slug}`
}

function priorityStringToNative(priority: string | undefined): number {
  switch ((priority ?? 'normal').trim().toLowerCase()) {
    case 'low':
      return -1
    case 'high':
      return 1
    case 'critical':
      return 2
    default:
      return 0
  }
}

function nativePriorityToString(priority: number | null | undefined): KanbanTask['priority'] {
  if (priority == null) return 'normal'
  if (priority <= -1) return 'low'
  if (priority >= 2) return 'critical'
  if (priority >= 1) return 'high'
  return 'normal'
}

function toIso(value: number | string | null | undefined): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const asNum = Number(trimmed)
    if (!Number.isNaN(asNum) && /^\d+$/.test(trimmed)) {
      return new Date(asNum * 1000).toISOString()
    }
    const date = new Date(trimmed)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
  }
  return new Date(value * 1000).toISOString()
}

function lastDefined<T>(items: T[] | undefined, pick: (item: T) => string | undefined): string | undefined {
  if (!items) return undefined
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const value = pick(items[i])
    if (value) return value
  }
  return undefined
}

function mapNativeTask(
  task: NativeTaskPayload,
  board: string,
  extras?: {
    comments?: NativeCommentPayload[]
    events?: NativeEventPayload[]
    links?: { parents?: string[]; children?: string[] }
    runs?: NativeRunPayload[]
  },
): KanbanTask {
  const comments = extras?.comments ?? []
  const events = extras?.events ?? []
  const runs = extras?.runs ?? []
  const links = extras?.links
  const activeRun = [...runs].reverse().find(run => !run.ended_at) ?? runs.at(-1)
  const latestBlockedReason = lastDefined(events, event => {
    if (event.kind !== 'blocked' && event.kind !== 'block') return undefined
    const payload = event.payload ?? {}
    const reason = payload.reason ?? payload.block_reason
    return typeof reason === 'string' && reason.trim() ? reason.trim() : undefined
  })
  const latestSummary = activeRun?.summary?.trim() || undefined
  const latestRunStatus = (() => {
    const candidate = activeRun?.status ?? activeRun?.outcome ?? task.status
    if (candidate === 'done' || candidate === 'completed' || candidate === 'success') return 'done'
    if (candidate === 'blocked') return 'blocked'
    if (candidate === 'running' || candidate === 'claimed') return 'running'
    if (candidate === 'failed' || candidate === 'error' || candidate === 'spawn_failed' || candidate === 'reclaimed') return 'failed'
    return task.status === 'running' ? 'running' : 'idle'
  })()

  return {
    taskId: task.id,
    title: task.title,
    body: task.body ?? '',
    status: (task.status as KanbanStatus) || 'triage',
    assignee: task.assignee || 'general',
    priority: nativePriorityToString(task.priority),
    tenant: task.tenant ?? undefined,
    workspaceType: task.workspace_kind ?? undefined,
    tags: [],
    parentIds: links?.parents ?? [],
    childIds: links?.children ?? [],
    commentCount: comments.length,
    boardSlug: board,
    createdAt: toIso(task.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(task.started_at ?? task.created_at) ?? new Date().toISOString(),
    completedAt: toIso(task.completed_at),
    claimedBy: task.status === 'running' ? (activeRun?.profile || task.assignee || undefined) : undefined,
    claimedAt: toIso(task.started_at),
    leaseExpiresAt: toIso(activeRun?.claim_expires ?? task.claim_expires),
    lastHeartbeatAt: toIso(activeRun?.last_heartbeat_at ?? task.last_heartbeat_at),
    attempt: runs.length || undefined,
    blockedReason: task.status === 'blocked' ? latestBlockedReason : undefined,
    resultSummary: latestSummary || (typeof task.result === 'string' && task.result.trim() ? task.result.trim() : undefined),
    activeRunId: task.current_run_id ? String(task.current_run_id) : activeRun?.id ? String(activeRun.id) : undefined,
    lastRunStatus: latestRunStatus,
    dependencyState: (links?.parents?.length ?? 0) > 0 && !['done', 'running', 'ready'].includes(task.status) ? 'waiting_on_parents' : 'clear',
    waitingOnTaskIds: (links?.parents?.length ?? 0) > 0 ? links?.parents : undefined,
  }
}

function mapLegacyTask(item: Record<string, unknown>, board: string): KanbanTask {
  return {
    taskId: item.taskId as string,
    title: item.title as string,
    body: (item.body as string) || '',
    status: (item.status as KanbanStatus) || 'triage',
    assignee: (item.assignee as string) || 'general',
    priority: ((item.priority as KanbanTask['priority']) || 'normal'),
    tenant: item.tenant as string | undefined,
    workspaceType: item.workspaceType as string | undefined,
    tags: (item.tags as string[]) ?? [],
    parentIds: (item.parentIds as string[]) ?? [],
    childIds: (item.childIds as string[]) ?? [],
    commentCount: (item.commentCount as number) ?? 0,
    boardSlug: board,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
    completedAt: item.completedAt as string | undefined,
    archivedAt: item.archivedAt as string | undefined,
    claimedBy: item.claimedBy as string | undefined,
    claimedAt: item.claimedAt as string | undefined,
    leaseExpiresAt: item.leaseExpiresAt as string | undefined,
    lastHeartbeatAt: item.lastHeartbeatAt as string | undefined,
    attempt: item.attempt as number | undefined,
    blockedReason: item.blockedReason as string | undefined,
    resultSummary: item.resultSummary as string | undefined,
    activeRunId: item.activeRunId as string | undefined,
    lastRunStatus: item.lastRunStatus as KanbanTask['lastRunStatus'] | undefined,
    dependencyState: item.dependencyState as KanbanTask['dependencyState'] | undefined,
    waitingOnTaskIds: item.waitingOnTaskIds as string[] | undefined,
    latestHandoff: item.latestHandoff as KanbanTask['latestHandoff'] | undefined,
  }
}

async function checkResponse(res: Response, context: string): Promise<void> {
  if (res.ok) return
  const body = await res.text().catch(() => '')
  throw new Error(`${context} failed: HTTP ${res.status} — ${body.slice(0, 300)}`)
}

export class HermesKanbanAdapter {
  readonly mode: HermesKanbanMode = hermesConfig.kanbanMode
  readonly bridgeUrl: string | null = hermesConfig.kanbanBridgeUrl
  lastBackendUsed: KanbanBackend | null = null

  private canAttemptNative() {
    return this.mode !== 'legacy' && !!this.bridgeUrl
  }

  private async withFallback<T>(nativeFn: () => Promise<T>, legacyFn: () => Promise<T>): Promise<T> {
    if (!this.canAttemptNative()) {
      this.lastBackendUsed = 'legacy'
      return legacyFn()
    }

    try {
      const result = await nativeFn()
      this.lastBackendUsed = 'native'
      return result
    } catch (error) {
      if (this.mode === 'native') throw error
      const result = await legacyFn()
      this.lastBackendUsed = 'legacy'
      return result
    }
  }

  private buildUrl(path: string, params?: URLSearchParams) {
    const url = new URL(`${this.bridgeUrl}${path}`)
    if (params) url.search = params.toString()
    return url.toString()
  }

  async listTasks(opts: ListTasksOptions): Promise<KanbanTask[]> {
    return this.withFallback(
      () => this.listTasksNative(opts),
      () => this.listTasksLegacy(opts),
    )
  }

  async getTask(taskId: string, opts: GetTaskOptions): Promise<{ task: KanbanTask; comments: KanbanComment[]; canDispatch: boolean }> {
    return this.withFallback(
      () => this.getTaskNative(taskId, opts),
      () => this.getTaskLegacy(taskId, opts),
    )
  }

  async createTask(input: CreateTaskInput): Promise<{ ok: true; taskId: string; task?: KanbanTask }> {
    return this.withFallback(
      () => this.createTaskNative(input),
      () => this.createTaskLegacy(input),
    )
  }

  async updateTask(taskId: string, patch: UpdateTaskInput, senderName: string, board?: string): Promise<{ ok: true; task?: KanbanTask }> {
    return this.withFallback(
      () => this.updateTaskNative(taskId, patch, board),
      () => this.updateTaskLegacy(taskId, patch, senderName, board),
    )
  }

  async addComment(taskId: string, text: string, senderName: string, board?: string): Promise<{ ok: true; commentId?: string }> {
    return this.withFallback(
      () => this.addCommentNative(taskId, text, senderName, board),
      () => this.addCommentLegacy(taskId, text, senderName),
    )
  }

  async dispatchTask(taskId: string, opts: { board?: string }): Promise<{ ok: true; task?: KanbanTask }> {
    if (!this.canAttemptNative()) {
      this.lastBackendUsed = 'legacy'
      throw new Error('native dispatch is not available in legacy mode')
    }

    try {
      const result = await this.dispatchTaskNative(taskId, opts)
      this.lastBackendUsed = 'native'
      return result
    } catch (error) {
      this.lastBackendUsed = this.mode === 'native' ? 'native' : 'legacy'
      throw error
    }
  }

  private async listTasksLegacy(opts: ListTasksOptions): Promise<KanbanTask[]> {
    const board = opts.board ?? 'default'
    const statusFilter = opts.status ?? null
    const assigneeFilter = opts.assignee ?? null
    const searchQuery = opts.search?.toLowerCase().trim() || null
    const includeArchived = Boolean(opts.includeArchived)

    const result = await ddb.send(new QueryCommand({
      TableName: TABLES.kanban,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': boardPk(board), ':prefix': 'TASK#' },
    }))

    let tasks = (result.Items ?? []).map(item => mapLegacyTask(item as Record<string, unknown>, board))

    if (!includeArchived) tasks = tasks.filter(task => !task.archivedAt)
    if (statusFilter) tasks = tasks.filter(task => task.status === statusFilter)
    if (assigneeFilter) tasks = tasks.filter(task => task.assignee === assigneeFilter)
    if (searchQuery) {
      tasks = tasks.filter(task =>
        task.title.toLowerCase().includes(searchQuery)
        || task.body.toLowerCase().includes(searchQuery)
        || (task.tags ?? []).some(tag => tag.toLowerCase().includes(searchQuery)),
      )
    }

    tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return tasks
  }

  private async listTasksNative(opts: ListTasksOptions): Promise<KanbanTask[]> {
    const board = opts.board ?? 'default'
    const params = new URLSearchParams({ board })
    if (opts.includeArchived) params.set('include_archived', 'true')

    const res = await fetch(this.buildUrl('/api/plugins/kanban/board', params), { cache: 'no-store' })
    await checkResponse(res, 'native kanban board')
    const data = await res.json() as { columns?: Array<{ name: string; tasks: NativeTaskPayload[] }> }
    const tasks = (data.columns ?? [])
      .flatMap(column => column.tasks ?? [])
      .map(task => mapNativeTask(task, board))

    const statusFilter = opts.status ?? null
    const assigneeFilter = opts.assignee ?? null
    const searchQuery = opts.search?.toLowerCase().trim() || null

    let filtered = tasks.filter(task => opts.includeArchived || !task.archivedAt)
    if (statusFilter) filtered = filtered.filter(task => task.status === statusFilter)
    if (assigneeFilter) filtered = filtered.filter(task => task.assignee === assigneeFilter)
    if (searchQuery) {
      filtered = filtered.filter(task =>
        task.title.toLowerCase().includes(searchQuery)
        || task.body.toLowerCase().includes(searchQuery)
        || (task.tags ?? []).some(tag => tag.toLowerCase().includes(searchQuery)),
      )
    }

    filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return filtered
  }

  private async getTaskLegacy(taskId: string, opts: GetTaskOptions): Promise<{ task: KanbanTask; comments: KanbanComment[]; canDispatch: boolean }> {
    const board = opts.board ?? 'default'
    const [taskRes, commentsRes] = await Promise.all([
      ddb.send(new GetCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardPk(board), sk: `TASK#${taskId}` },
      })),
      ddb.send(new QueryCommand({
        TableName: TABLES.kanban,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': `TASK#${taskId}`, ':prefix': 'COMMENT#' },
        ScanIndexForward: true,
      })),
    ])

    if (!taskRes.Item) throw new Error('task not found')

    const task = mapLegacyTask(taskRes.Item as Record<string, unknown>, board)
    const comments = (commentsRes.Items ?? []).map(comment => ({
      commentId: comment.commentId as string,
      body: comment.body as string,
      author: comment.author as string,
      ts: comment.ts as string,
    }))

    return { task, comments, canDispatch: false }
  }

  private async getTaskNative(taskId: string, opts: GetTaskOptions): Promise<{ task: KanbanTask; comments: KanbanComment[]; canDispatch: boolean }> {
    const board = opts.board ?? 'default'
    const params = new URLSearchParams({ board })
    const res = await fetch(this.buildUrl(`/api/plugins/kanban/tasks/${encodeURIComponent(taskId)}`, params), { cache: 'no-store' })
    await checkResponse(res, `native kanban task ${taskId}`)
    const data = await res.json() as NativeTaskDetailResponse
    const comments = (data.comments ?? []).map(comment => ({
      commentId: String(comment.id),
      body: comment.body,
      author: comment.author ?? 'dashboard',
      ts: toIso(comment.created_at) ?? new Date().toISOString(),
    }))
    const task = mapNativeTask(data.task, board, {
      comments: data.comments,
      events: data.events,
      links: data.links,
      runs: data.runs,
    })

    const canDispatch = Boolean(
      this.canAttemptNative()
      && task.assignee
      && !task.archivedAt
      && task.status !== 'done',
    )

    return { task, comments, canDispatch }
  }

  private async createTaskLegacy(input: CreateTaskInput): Promise<{ ok: true; taskId: string }> {
    const title = (input.title ?? '').trim()
    if (!title) throw new Error('title required')

    const board = input.board ?? 'default'
    const assignee = (input.assignee ?? 'general').trim()
    const priority = (input.priority ?? 'normal').trim()
    const workspace = (input.workspaceType ?? 'scratch').trim()
    const description = (input.description ?? '').trim()
    const tags = input.tags ?? []
    const now = new Date().toISOString()
    const taskId = `t_${randomBytes(4).toString('hex')}`

    await ddb.send(new PutCommand({
      TableName: TABLES.kanban,
      Item: {
        pk: boardPk(board),
        sk: `TASK#${taskId}`,
        taskId,
        title,
        body: description,
        status: 'triage',
        assignee,
        priority,
        workspaceType: workspace,
        tags,
        tenant: input.tenant ?? null,
        parentIds: [],
        childIds: [],
        commentCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    }))

    return { ok: true, taskId }
  }

  private async createTaskNative(input: CreateTaskInput): Promise<{ ok: true; taskId: string; task?: KanbanTask }> {
    const title = (input.title ?? '').trim()
    if (!title) throw new Error('title required')
    const board = input.board ?? 'default'
    const params = new URLSearchParams({ board })
    const res = await fetch(this.buildUrl('/api/plugins/kanban/tasks', params), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body: (input.description ?? '').trim() || undefined,
        assignee: (input.assignee ?? 'general').trim() || undefined,
        tenant: input.tenant ?? undefined,
        priority: priorityStringToNative(input.priority),
        workspace_kind: (input.workspaceType ?? 'scratch').trim() || 'scratch',
      }),
    })
    await checkResponse(res, 'native create task')
    const data = await res.json() as { task?: NativeTaskPayload }
    const task = data.task ? mapNativeTask(data.task, board) : undefined
    return { ok: true, taskId: task?.taskId ?? '', task }
  }

  private async updateTaskLegacy(taskId: string, patch: UpdateTaskInput, senderName: string, board = 'default'): Promise<{ ok: true; task?: KanbanTask }> {
    const boardKey = boardPk(board)
    const now = new Date().toISOString()

    if (patch.archived) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardKey, sk: `TASK#${taskId}` },
        UpdateExpression: 'SET archivedAt = :ts, updatedAt = :ts2',
        ExpressionAttributeValues: { ':ts': now, ':ts2': now },
      }))
      const refreshed = await this.getTaskLegacy(taskId, { board })
      return { ok: true, task: refreshed.task }
    }

    if (patch.status) {
      const status = patch.status
      let updateExpr = 'SET #st = :s, updatedAt = :ts'
      const attrNames: Record<string, string> = { '#st': 'status' }
      const attrValues: Record<string, unknown> = { ':s': status, ':ts': now }

      if (status === 'done') {
        updateExpr += ', completedAt = :ts'
        hermesClient.kanbanComplete(taskId, patch.result, senderName).catch(() => {})
      } else if (status === 'blocked') {
        updateExpr += ', blockedReason = :reason'
        attrValues[':reason'] = patch.reason ?? 'blocked from UI'
        hermesClient.kanbanBlock(taskId, patch.reason, senderName).catch(() => {})
      } else {
        updateExpr += ' REMOVE blockedReason'
      }

      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardKey, sk: `TASK#${taskId}` },
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: attrNames,
        ExpressionAttributeValues: attrValues,
      }))
      const refreshed = await this.getTaskLegacy(taskId, { board })
      return { ok: true, task: refreshed.task }
    }

    if (patch.assignee) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardKey, sk: `TASK#${taskId}` },
        UpdateExpression: 'SET assignee = :a, updatedAt = :ts',
        ExpressionAttributeValues: { ':a': patch.assignee, ':ts': now },
      }))
      const refreshed = await this.getTaskLegacy(taskId, { board })
      return { ok: true, task: refreshed.task }
    }

    if (patch.title) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardKey, sk: `TASK#${taskId}` },
        UpdateExpression: 'SET title = :t, updatedAt = :ts',
        ExpressionAttributeValues: { ':t': patch.title, ':ts': now },
      }))
      const refreshed = await this.getTaskLegacy(taskId, { board })
      return { ok: true, task: refreshed.task }
    }

    if (patch.priority) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardKey, sk: `TASK#${taskId}` },
        UpdateExpression: 'SET priority = :p, updatedAt = :ts',
        ExpressionAttributeValues: { ':p': patch.priority, ':ts': now },
      }))
      const refreshed = await this.getTaskLegacy(taskId, { board })
      return { ok: true, task: refreshed.task }
    }

    throw new Error('No recognized update field')
  }

  private async updateTaskNative(taskId: string, patch: UpdateTaskInput, board = 'default'): Promise<{ ok: true; task?: KanbanTask }> {
    const params = new URLSearchParams({ board })
    const body: Record<string, unknown> = {}

    if (patch.archived) {
      body.status = 'archived'
    }
    if (patch.status) body.status = patch.status
    if (patch.assignee !== undefined) body.assignee = patch.assignee
    if (patch.title !== undefined) body.title = patch.title
    if (patch.priority !== undefined) body.priority = priorityStringToNative(patch.priority)
    if (patch.result !== undefined) body.result = patch.result
    if (patch.reason !== undefined) body.block_reason = patch.reason

    const res = await fetch(this.buildUrl(`/api/plugins/kanban/tasks/${encodeURIComponent(taskId)}`, params), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkResponse(res, `native update task ${taskId}`)
    const data = await res.json() as { task?: NativeTaskPayload }
    return { ok: true, task: data.task ? mapNativeTask(data.task, board) : undefined }
  }

  private async addCommentLegacy(taskId: string, text: string, senderName: string): Promise<{ ok: true; commentId: string }> {
    const now = new Date().toISOString()
    const commentId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    await ddb.send(new PutCommand({
      TableName: TABLES.kanban,
      Item: {
        pk: `TASK#${taskId}`,
        sk: `COMMENT#${now}#${commentId}`,
        commentId,
        body: text,
        author: senderName,
        ts: now,
      },
    }))

    hermesClient.kanbanComment(taskId, text, senderName).catch(() => {})
    return { ok: true, commentId }
  }

  private async addCommentNative(taskId: string, text: string, senderName: string, board = 'default'): Promise<{ ok: true }> {
    const params = new URLSearchParams({ board })
    const res = await fetch(this.buildUrl(`/api/plugins/kanban/tasks/${encodeURIComponent(taskId)}/comments`, params), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, author: senderName }),
    })
    await checkResponse(res, `native add comment ${taskId}`)
    return { ok: true }
  }

  private async dispatchTaskNative(taskId: string, opts: { board?: string }): Promise<{ ok: true; task?: KanbanTask }> {
    const board = opts.board ?? 'default'
    const detail = await this.getTaskNative(taskId, { board })

    if (detail.task.archivedAt || detail.task.status === 'done') {
      throw new Error('task is already finished')
    }
    if (!detail.task.assignee || detail.task.assignee === 'general') {
      throw new Error('assign the task to a concrete agent before dispatching')
    }
    if (detail.task.status === 'triage') {
      throw new Error('triage tasks must be specified before dispatch')
    }

    if (detail.task.status === 'todo' || detail.task.status === 'blocked') {
      await this.updateTaskNative(taskId, { status: 'ready' }, board)
    }

    const params = new URLSearchParams({ board, dry_run: 'false', max: '8' })
    const dispatchRes = await fetch(this.buildUrl('/api/plugins/kanban/dispatch', params), { method: 'POST' })
    await checkResponse(dispatchRes, 'native dispatch nudge')

    const refreshed = await this.getTaskNative(taskId, { board })
    return { ok: true, task: refreshed.task }
  }
}

export const hermesKanban = new HermesKanbanAdapter()
