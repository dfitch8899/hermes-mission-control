import { randomBytes } from 'crypto'
import { ddb, TABLES, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@/lib/dynamodb'
import { hermesClient } from '@/lib/hermesClient'
import { hermesConfig, type HermesKanbanMode } from '@/lib/config'
import type { KanbanBackend, KanbanBoard, KanbanComment, KanbanEvent, KanbanRun, KanbanTask, KanbanStatus, KanbanTaskLog } from '@/types/kanban'

interface ListTasksOptions {
  board?: string
  status?: KanbanStatus | null
  assignee?: string | null
  tenant?: string | null
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
  workspacePath?: string
  tenant?: string
  tags?: string[]
  parentIds?: string[]
  triage?: boolean
  idempotencyKey?: string
  maxRuntimeSeconds?: number
  skills?: string[]
  board?: string
}

interface UpdateTaskInput {
  status?: string
  reason?: string
  result?: string
  summary?: string
  metadata?: Record<string, unknown>
  assignee?: string
  archived?: boolean
  title?: string
  body?: string
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
  workspace_path?: string | null
  skills?: string[] | null
  idempotency_key?: string | null
  max_runtime_seconds?: number | null
  created_at?: number | null
  started_at?: number | null
  completed_at?: number | null
  claim_expires?: number | null
  last_heartbeat_at?: number | null
  current_run_id?: number | null
  result?: string | null
  comment_count?: number | null
  link_counts?: { parents?: number; children?: number } | null
  progress?: { done?: number; total?: number } | null
}

interface NativeCommentPayload {
  id: number | string
  body: string
  author?: string | null
  created_at?: number | null
}

interface NativeEventPayload {
  id?: number | string
  task_id?: string
  kind: string
  payload?: Record<string, unknown> | null
  created_at?: number | null
  run_id?: number | null
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
  metadata?: Record<string, unknown> | null
  error?: string | null
}

interface NativeTaskDetailResponse {
  task: NativeTaskPayload
  comments?: NativeCommentPayload[]
  events?: NativeEventPayload[]
  links?: { parents?: string[]; children?: string[] }
  runs?: NativeRunPayload[]
}

interface NativeBoardResponse {
  columns?: Array<{ name: string; tasks: NativeTaskPayload[] }>
}

interface NativeBoardPayload {
  slug: string
  name?: string | null
  description?: string | null
  icon?: string | null
  color?: string | null
  created_at?: number | string | null
  archived?: boolean | null
  is_current?: boolean | null
  counts?: Record<string, number> | null
  total?: number | null
}

interface NativeBoardsResponse {
  boards?: NativeBoardPayload[]
  current?: string | null
}

interface NativeLogResponse {
  exists?: boolean
  content?: string
  truncated?: boolean
  path?: string
  size_bytes?: number
}

interface TaskDetailResult {
  task: KanbanTask
  comments: KanbanComment[]
  events: KanbanEvent[]
  runs: KanbanRun[]
  canDispatch: boolean
  log: KanbanTaskLog
}

interface BodyMeta {
  tags?: string[]
}

function boardPk(slug: string) {
  return `BOARD#${slug}`
}

function normalizeBoardSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'default'
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
    if (!Number.isNaN(asNum) && /^\d+$/.test(trimmed)) return new Date(asNum * 1000).toISOString()
    const date = new Date(trimmed)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
  }
  return new Date(value * 1000).toISOString()
}

function maxIso(...values: Array<string | undefined>) {
  return values.filter(Boolean).sort().at(-1)
}

function extractBodyMeta(raw: string | null | undefined): { body: string; meta: BodyMeta } {
  const text = raw ?? ''
  const match = text.match(/\n?\n?<!--\s*hermes-mc:(\{[\s\S]*\})\s*-->\s*$/)
  if (!match) return { body: text, meta: {} }
  try {
    const parsed = JSON.parse(match[1]) as BodyMeta
    const body = text.slice(0, match.index).trimEnd()
    const tags = Array.isArray(parsed.tags) ? parsed.tags.map(tag => String(tag).trim()).filter(Boolean) : undefined
    return { body, meta: { tags } }
  } catch {
    return { body: text, meta: {} }
  }
}

function attachBodyMeta(body: string | undefined, meta: BodyMeta): string | undefined {
  const trimmedBody = (body ?? '').trim()
  const tags = (meta.tags ?? []).map(tag => tag.trim()).filter(Boolean)
  if (tags.length === 0) return trimmedBody || undefined
  const payload = JSON.stringify({ tags })
  return trimmedBody ? `${trimmedBody}\n\n<!-- hermes-mc:${payload} -->` : `<!-- hermes-mc:${payload} -->`
}

function nativeStatusToMissionStatus(status: string | null | undefined): KanbanStatus {
  switch (status) {
    case 'triage':
    case 'todo':
    case 'ready':
    case 'running':
    case 'blocked':
    case 'done':
    case 'archived':
      return status
    default:
      return 'triage'
  }
}

function summarizeLatestHandoff(runs: NativeRunPayload[] | undefined): KanbanTask['latestHandoff'] | undefined {
  if (!runs?.length) return undefined
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const metadata = runs[i].metadata
    if (!metadata || typeof metadata !== 'object') continue
    const from = typeof metadata.from === 'string' ? metadata.from.trim() : ''
    const to = typeof metadata.to === 'string' ? metadata.to.trim() : ''
    if (!from || !to) continue
    return {
      from,
      to,
      ts: toIso(runs[i].ended_at ?? runs[i].started_at) ?? new Date().toISOString(),
      note: typeof metadata.note === 'string' ? metadata.note : undefined,
    }
  }
  return undefined
}

function mapNativeRun(run: NativeRunPayload): KanbanRun {
  return {
    runId: String(run.id),
    profile: run.profile ?? undefined,
    status: run.status ?? undefined,
    outcome: run.outcome ?? undefined,
    summary: run.summary ?? undefined,
    error: run.error ?? undefined,
    metadata: run.metadata ?? undefined,
    startedAt: toIso(run.started_at),
    endedAt: toIso(run.ended_at),
    heartbeatAt: toIso(run.last_heartbeat_at),
    claimExpiresAt: toIso(run.claim_expires),
  }
}

function mapNativeEvent(event: NativeEventPayload, taskId: string): KanbanEvent {
  return {
    eventId: String(event.id ?? `${event.kind}-${event.created_at ?? '0'}`),
    taskId: event.task_id ?? taskId,
    kind: event.kind,
    payload: event.payload ?? undefined,
    ts: toIso(event.created_at) ?? new Date().toISOString(),
    runId: event.run_id != null ? String(event.run_id) : undefined,
  }
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
  const { body, meta } = extractBodyMeta(task.body ?? '')
  const parentIds = links?.parents ?? []
  const childIds = links?.children ?? []
  const parentCount = parentIds.length || task.link_counts?.parents || 0
  const childCount = childIds.length || task.link_counts?.children || 0
  const activeRun = [...runs].reverse().find(run => !run.ended_at) ?? runs.at(-1)
  const blockedReason = (() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i]
      if (event.kind !== 'blocked' && event.kind !== 'block') continue
      const reason = event.payload?.reason ?? event.payload?.block_reason
      if (typeof reason === 'string' && reason.trim()) return reason.trim()
    }
    return undefined
  })()
  const latestSummary = activeRun?.summary?.trim() || undefined
  const runStatusCandidate = activeRun?.status ?? activeRun?.outcome ?? task.status
  const lastRunStatus: KanbanTask['lastRunStatus'] =
    runStatusCandidate === 'done' || runStatusCandidate === 'completed' || runStatusCandidate === 'success'
      ? 'done'
      : runStatusCandidate === 'blocked'
        ? 'blocked'
        : runStatusCandidate === 'running' || runStatusCandidate === 'claimed'
          ? 'running'
          : runStatusCandidate === 'failed' || runStatusCandidate === 'error' || runStatusCandidate === 'spawn_failed' || runStatusCandidate === 'reclaimed' || runStatusCandidate === 'timed_out' || runStatusCandidate === 'gave_up'
            ? 'failed'
            : task.status === 'running'
              ? 'running'
              : 'idle'
  const nativeStatus = task.status || 'triage'
  const isArchived = nativeStatus === 'archived'
  const createdAt = toIso(task.created_at) ?? new Date().toISOString()
  const updatedAt = maxIso(
    createdAt,
    toIso(task.started_at),
    toIso(task.completed_at),
    toIso(task.last_heartbeat_at),
    ...comments.map(comment => toIso(comment.created_at)),
    ...events.map(event => toIso(event.created_at)),
    ...runs.flatMap(run => [toIso(run.started_at), toIso(run.ended_at), toIso(run.last_heartbeat_at)]),
  ) ?? createdAt

  return {
    taskId: task.id,
    title: task.title,
    body,
    status: nativeStatusToMissionStatus(nativeStatus),
    assignee: task.assignee ?? '',
    priority: nativePriorityToString(task.priority),
    tenant: task.tenant ?? undefined,
    workspaceType: task.workspace_kind ?? undefined,
    workspacePath: task.workspace_path ?? undefined,
    tags: meta.tags ?? [],
    skills: task.skills ?? undefined,
    idempotencyKey: task.idempotency_key ?? undefined,
    maxRuntimeSeconds: task.max_runtime_seconds ?? undefined,
    parentIds,
    childIds,
    parentCount,
    childCount,
    childProgress: task.progress?.total ? { done: task.progress.done ?? 0, total: task.progress.total ?? 0 } : undefined,
    commentCount: task.comment_count ?? comments.length,
    boardSlug: board,
    createdAt,
    updatedAt,
    completedAt: toIso(task.completed_at),
    archivedAt: isArchived ? maxIso(toIso(task.completed_at), updatedAt, createdAt) : undefined,
    nativeStatus,
    claimedBy: nativeStatus === 'running' ? (activeRun?.profile || task.assignee || undefined) : undefined,
    claimedAt: toIso(task.started_at),
    leaseExpiresAt: toIso(activeRun?.claim_expires ?? task.claim_expires),
    lastHeartbeatAt: toIso(activeRun?.last_heartbeat_at ?? task.last_heartbeat_at),
    attempt: runs.length || undefined,
    blockedReason: nativeStatus === 'blocked' ? blockedReason : undefined,
    resultSummary: latestSummary || (typeof task.result === 'string' && task.result.trim() ? task.result.trim() : undefined),
    activeRunId: task.current_run_id ? String(task.current_run_id) : activeRun?.id ? String(activeRun.id) : undefined,
    lastRunStatus,
    dependencyState: parentCount > 0 && !['done', 'running', 'ready'].includes(nativeStatus) ? 'waiting_on_parents' : 'clear',
    waitingOnTaskIds: parentIds.length ? parentIds : undefined,
    latestHandoff: summarizeLatestHandoff(runs),
  }
}

function mapLegacyTask(item: Record<string, unknown>, board: string): KanbanTask {
  const parentIds = (item.parentIds as string[]) ?? []
  const childIds = (item.childIds as string[]) ?? []
  return {
    taskId: item.taskId as string,
    title: item.title as string,
    body: (item.body as string) || '',
    status: (item.status as KanbanStatus) || 'triage',
    assignee: (item.assignee as string) ?? '',
    priority: ((item.priority as KanbanTask['priority']) || 'normal'),
    tenant: item.tenant as string | undefined,
    workspaceType: item.workspaceType as string | undefined,
    workspacePath: item.workspacePath as string | undefined,
    tags: (item.tags as string[]) ?? [],
    skills: item.skills as string[] | undefined,
    idempotencyKey: item.idempotencyKey as string | undefined,
    maxRuntimeSeconds: item.maxRuntimeSeconds as number | undefined,
    parentIds,
    childIds,
    parentCount: parentIds.length,
    childCount: childIds.length,
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

function mapLegacyBoard(item: Record<string, unknown>): KanbanBoard {
  return {
    slug: item.slug as string,
    name: item.name as string,
    createdAt: (item.createdAt as string) ?? new Date().toISOString(),
    description: (item.description as string) ?? undefined,
    icon: (item.icon as string) ?? undefined,
    color: (item.color as string) ?? undefined,
    archived: Boolean(item.archived),
  }
}

function mapNativeBoard(board: NativeBoardPayload, current?: string | null): KanbanBoard {
  const counts = board.counts ?? undefined
  const total = board.total ?? (counts ? Object.values(counts).reduce((sum, value) => sum + value, 0) : undefined)
  return {
    slug: board.slug,
    name: board.name?.trim() || board.slug,
    createdAt: toIso(board.created_at) ?? new Date().toISOString(),
    description: board.description ?? undefined,
    icon: board.icon ?? undefined,
    color: board.color ?? undefined,
    archived: Boolean(board.archived),
    isCurrent: board.is_current ?? (current ? board.slug === current : undefined),
    counts,
    total,
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

  private requireNative(reason = 'Mission Control /kanban now requires Hermes native kanban.') {
    if (this.mode === 'legacy') {
      throw new Error(`${reason} Set HERMES_KANBAN_MODE=native (or hybrid during migration).`)
    }
    if (!this.bridgeUrl) {
      throw new Error(`${reason} Configure HERMES_KANBAN_BRIDGE_URL or HERMES_DASHBOARD_URL.`)
    }
    this.lastBackendUsed = 'native'
  }

  private buildUrl(path: string, params?: URLSearchParams) {
    const url = new URL(path, this.bridgeUrl ?? undefined)
    if (params) url.search = params.toString()
    return url.toString()
  }

  async listBoards(includeArchived = false): Promise<KanbanBoard[]> {
    this.requireNative('Mission Control boards are native-only.')
    return this.listBoardsNative(includeArchived)
  }

  async createBoard(input: { name: string; slug?: string; description?: string; icon?: string; color?: string; switchToBoard?: boolean }): Promise<{ board: KanbanBoard }> {
    this.requireNative('Mission Control boards are native-only.')
    return this.createBoardNative(input)
  }

  async updateBoard(slug: string, input: { name?: string; description?: string; icon?: string; color?: string }): Promise<{ board: KanbanBoard }> {
    this.requireNative('Mission Control boards are native-only.')
    return this.updateBoardNative(slug, input)
  }

  async deleteBoard(slug: string, opts?: { hardDelete?: boolean }): Promise<{ ok: true }> {
    this.requireNative('Mission Control boards are native-only.')
    return this.deleteBoardNative(slug, opts)
  }

  async listTasks(opts: ListTasksOptions): Promise<KanbanTask[]> {
    this.requireNative()
    return this.listTasksNative(opts)
  }

  async getTask(taskId: string, opts: GetTaskOptions): Promise<TaskDetailResult> {
    this.requireNative()
    return this.getTaskNative(taskId, opts)
  }

  async createTask(input: CreateTaskInput): Promise<{ ok: true; taskId: string; task?: KanbanTask }> {
    this.requireNative()
    return this.createTaskNative(input)
  }

  async updateTask(taskId: string, patch: UpdateTaskInput, senderName: string, board?: string): Promise<{ ok: true; task?: KanbanTask }> {
    void senderName
    this.requireNative()
    return this.updateTaskNative(taskId, patch, board)
  }

  async addComment(taskId: string, text: string, senderName: string, board?: string): Promise<{ ok: true; commentId?: string }> {
    this.requireNative()
    return this.addCommentNative(taskId, text, senderName, board)
  }

  async addLink(parentId: string, childId: string, opts: { board?: string }): Promise<{ ok: true }> {
    this.requireNative()
    const params = new URLSearchParams({ board: opts.board ?? 'default' })
    const res = await fetch(this.buildUrl('/api/plugins/kanban/links', params), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parentId, child_id: childId }),
    })
    await checkResponse(res, 'native add link')
    this.lastBackendUsed = 'native'
    return { ok: true }
  }

  async deleteLink(parentId: string, childId: string, opts: { board?: string }): Promise<{ ok: true }> {
    this.requireNative()
    const params = new URLSearchParams({ board: opts.board ?? 'default', parent_id: parentId, child_id: childId })
    const res = await fetch(this.buildUrl('/api/plugins/kanban/links', params), { method: 'DELETE' })
    await checkResponse(res, 'native delete link')
    this.lastBackendUsed = 'native'
    return { ok: true }
  }

  async dispatchTask(taskId: string, opts: { board?: string }): Promise<{ ok: true; task?: KanbanTask }> {
    this.requireNative()
    const result = await this.dispatchTaskNative(taskId, opts)
    this.lastBackendUsed = 'native'
    return result
  }

  private async listBoardsLegacy(): Promise<KanbanBoard[]> {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLES.kanban,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': 'BOARD_META', ':sk': 'BOARD#' },
    }))

    let boards = (res.Items ?? []).map(item => mapLegacyBoard(item as Record<string, unknown>))
    if (boards.length === 0) {
      const board: KanbanBoard = { slug: 'default', name: 'Default', createdAt: new Date().toISOString() }
      await ddb.send(new PutCommand({
        TableName: TABLES.kanban,
        Item: { pk: 'BOARD_META', sk: 'BOARD#default', ...board },
        ConditionExpression: 'attribute_not_exists(pk)',
      })).catch(() => {})
      boards = [board]
    }

    boards.sort((a, b) => a.slug === 'default' ? -1 : b.slug === 'default' ? 1 : a.name.localeCompare(b.name))
    return boards
  }

  private async listBoardsNative(includeArchived = false): Promise<KanbanBoard[]> {
    const params = includeArchived ? new URLSearchParams({ include_archived: 'true' }) : undefined
    const res = await fetch(this.buildUrl('/api/plugins/kanban/boards', params), { cache: 'no-store' })
    await checkResponse(res, 'native list boards')
    const data = await res.json() as NativeBoardsResponse
    const boards = (data.boards ?? []).map(board => mapNativeBoard(board, data.current))
    boards.sort((a, b) => a.slug === 'default' ? -1 : b.slug === 'default' ? 1 : a.name.localeCompare(b.name))
    return boards
  }

  private async createBoardLegacy(input: { name: string; slug?: string; description?: string; icon?: string; color?: string; switchToBoard?: boolean }): Promise<{ board: KanbanBoard }> {
    const name = input.name.trim()
    if (!name) throw new Error('name required')
    const slug = normalizeBoardSlug(input.slug ?? name)
    const board: KanbanBoard = {
      slug,
      name,
      description: input.description?.trim() || undefined,
      icon: input.icon?.trim() || undefined,
      color: input.color?.trim() || undefined,
      createdAt: new Date().toISOString(),
    }
    await ddb.send(new PutCommand({
      TableName: TABLES.kanban,
      Item: { pk: 'BOARD_META', sk: `BOARD#${slug}`, ...board },
    }))
    return { board }
  }

  private async createBoardNative(input: { name: string; slug?: string; description?: string; icon?: string; color?: string; switchToBoard?: boolean }): Promise<{ board: KanbanBoard }> {
    const name = input.name.trim()
    if (!name) throw new Error('name required')
    const slug = normalizeBoardSlug(input.slug ?? name)
    const res = await fetch(this.buildUrl('/api/plugins/kanban/boards'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, name, description: input.description, icon: input.icon, color: input.color, switch: Boolean(input.switchToBoard) }),
    })
    await checkResponse(res, 'native create board')
    const data = await res.json() as { board?: NativeBoardPayload }
    return { board: mapNativeBoard(data.board ?? { slug, name }) }
  }

  private async deleteBoardLegacy(slug: string): Promise<{ ok: true }> {
    if (slug === 'default') throw new Error('Cannot delete the default board')
    await ddb.send(new DeleteCommand({
      TableName: TABLES.kanban,
      Key: { pk: 'BOARD_META', sk: `BOARD#${slug}` },
    }))
    let lastKey: Record<string, unknown> | undefined
    do {
      const res = await ddb.send(new QueryCommand({
        TableName: TABLES.kanban,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': boardPk(slug) },
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
    return { ok: true }
  }

  private async updateBoardNative(slug: string, input: { name?: string; description?: string; icon?: string; color?: string }): Promise<{ board: KanbanBoard }> {
    const res = await fetch(this.buildUrl(`/api/plugins/kanban/boards/${encodeURIComponent(slug)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name, description: input.description, icon: input.icon, color: input.color }),
    })
    await checkResponse(res, `native update board ${slug}`)
    const data = await res.json() as { board?: NativeBoardPayload }
    return { board: mapNativeBoard(data.board ?? { slug, name: input.name ?? slug }) }
  }

  private async deleteBoardNative(slug: string, opts?: { hardDelete?: boolean }): Promise<{ ok: true }> {
    const query = opts?.hardDelete ? new URLSearchParams({ delete: 'true' }) : undefined
    const res = await fetch(this.buildUrl(`/api/plugins/kanban/boards/${encodeURIComponent(slug)}`, query), { method: 'DELETE' })
    await checkResponse(res, `native delete board ${slug}`)
    return { ok: true }
  }

  private async listTasksLegacy(opts: ListTasksOptions): Promise<KanbanTask[]> {
    const board = opts.board ?? 'default'
    const statusFilter = opts.status ?? null
    const assigneeFilter = opts.assignee ?? null
    const tenantFilter = opts.tenant ?? null
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
    if (tenantFilter) tasks = tasks.filter(task => task.tenant === tenantFilter)
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
    const data = await res.json() as NativeBoardResponse
    const tasks = (data.columns ?? []).flatMap(column => column.tasks ?? []).map(task => mapNativeTask(task, board))

    const statusFilter = opts.status ?? null
    const assigneeFilter = opts.assignee ?? null
    const tenantFilter = opts.tenant ?? null
    const searchQuery = opts.search?.toLowerCase().trim() || null
    let filtered = tasks.filter(task => opts.includeArchived || !task.archivedAt)
    if (statusFilter) filtered = filtered.filter(task => task.status === statusFilter)
    if (assigneeFilter) filtered = filtered.filter(task => task.assignee === assigneeFilter)
    if (tenantFilter) filtered = filtered.filter(task => task.tenant === tenantFilter)
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

  private async getTaskLegacy(taskId: string, opts: GetTaskOptions): Promise<TaskDetailResult> {
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
    const comments = (commentsRes.Items ?? []).map(comment => ({
      commentId: comment.commentId as string,
      body: comment.body as string,
      author: comment.author as string,
      ts: comment.ts as string,
    }))
    const task = {
      ...mapLegacyTask(taskRes.Item as Record<string, unknown>, board),
      commentCount: comments.length,
    }

    return {
      task,
      comments,
      events: [],
      runs: [],
      canDispatch: false,
      log: { exists: false, content: '', truncated: false },
    }
  }

  private async getTaskNative(taskId: string, opts: GetTaskOptions): Promise<TaskDetailResult> {
    const board = opts.board ?? 'default'
    const params = new URLSearchParams({ board })
    const [detailRes, logRes] = await Promise.all([
      fetch(this.buildUrl(`/api/plugins/kanban/tasks/${encodeURIComponent(taskId)}`, params), { cache: 'no-store' }),
      fetch(this.buildUrl(`/api/plugins/kanban/tasks/${encodeURIComponent(taskId)}/log`, new URLSearchParams({ board, tail: '6000' })), { cache: 'no-store' }).catch(() => null),
    ])
    await checkResponse(detailRes, `native kanban task ${taskId}`)
    const data = await detailRes.json() as NativeTaskDetailResponse
    const comments = (data.comments ?? []).map(comment => ({
      commentId: String(comment.id),
      body: comment.body,
      author: comment.author ?? 'dashboard',
      ts: toIso(comment.created_at) ?? new Date().toISOString(),
    }))
    const events = (data.events ?? []).map(event => mapNativeEvent(event, taskId))
    const runs = (data.runs ?? []).map(mapNativeRun)
    const task = mapNativeTask(data.task, board, {
      comments: data.comments,
      events: data.events,
      links: data.links,
      runs: data.runs,
    })
    let log: KanbanTaskLog = { exists: false, content: '', truncated: false }
    if (logRes && logRes.ok) {
      const payload = await logRes.json() as NativeLogResponse
      log = {
        exists: Boolean(payload.exists),
        content: payload.content ?? '',
        truncated: Boolean(payload.truncated),
        path: payload.path,
        sizeBytes: payload.size_bytes,
      }
    }

    const canDispatch = Boolean(
      !task.archivedAt
      && ['ready', 'todo', 'blocked'].includes(data.task.status)
      && Boolean(task.assignee),
    )

    return {
      task,
      comments,
      events,
      runs,
      canDispatch,
      log,
    }
  }

  private async createTaskLegacy(input: CreateTaskInput): Promise<{ ok: true; taskId: string; task?: KanbanTask }> {
    const title = (input.title ?? '').trim()
    if (!title) throw new Error('title required')
    const board = input.board ?? 'default'
    const assignee = (input.assignee ?? '').trim()
    const priority = (input.priority ?? 'normal').trim()
    const workspace = (input.workspaceType ?? 'scratch').trim()
    const description = (input.description ?? '').trim()
    const tags = input.tags ?? []
    const wantsTriage = input.triage ?? assignee === ''
    const status: KanbanStatus = wantsTriage ? 'triage' : assignee ? 'ready' : 'todo'
    const parentIds = input.parentIds ?? []
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
        status,
        assignee,
        priority,
        workspaceType: workspace,
        tags,
        tenant: input.tenant ?? null,
        workspacePath: input.workspacePath ?? null,
        skills: input.skills ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        maxRuntimeSeconds: input.maxRuntimeSeconds ?? null,
        parentIds,
        childIds: [],
        commentCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    }))

    for (const parentId of parentIds) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardPk(board), sk: `TASK#${parentId}` },
        UpdateExpression: 'SET childIds = list_append(if_not_exists(childIds, :empty), :child), updatedAt = :ts',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeValues: {
          ':empty': [],
          ':child': [taskId],
          ':ts': now,
        },
      })).catch(() => {})
    }

    return { ok: true, taskId, task: mapLegacyTask({
      taskId,
      title,
      body: description,
      status,
      assignee,
      priority,
      workspaceType: workspace,
      tags,
      tenant: input.tenant ?? undefined,
      workspacePath: input.workspacePath ?? undefined,
      skills: input.skills ?? undefined,
      idempotencyKey: input.idempotencyKey ?? undefined,
      maxRuntimeSeconds: input.maxRuntimeSeconds ?? undefined,
      parentIds,
      childIds: [],
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
    }, board) }
  }

  private async createTaskNative(input: CreateTaskInput): Promise<{ ok: true; taskId: string; task?: KanbanTask }> {
    const title = (input.title ?? '').trim()
    if (!title) throw new Error('title required')
    const board = input.board ?? 'default'
    const params = new URLSearchParams({ board })
    const bodyWithMeta = attachBodyMeta((input.description ?? '').trim() || undefined, { tags: input.tags })
    const normalizedAssignee = (input.assignee ?? '').trim()
    const wantsTriage = input.triage ?? normalizedAssignee === ''
    const res = await fetch(this.buildUrl('/api/plugins/kanban/tasks', params), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body: bodyWithMeta,
        assignee: normalizedAssignee || undefined,
        tenant: input.tenant ?? undefined,
        priority: priorityStringToNative(input.priority),
        workspace_kind: (input.workspaceType ?? 'scratch').trim() || 'scratch',
        workspace_path: input.workspacePath ?? undefined,
        parents: input.parentIds ?? [],
        triage: wantsTriage,
        idempotency_key: input.idempotencyKey ?? undefined,
        max_runtime_seconds: input.maxRuntimeSeconds ?? undefined,
        skills: input.skills ?? undefined,
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
      return { ok: true, task: (await this.getTaskLegacy(taskId, { board })).task }
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
      return { ok: true, task: (await this.getTaskLegacy(taskId, { board })).task }
    }

    if (patch.assignee !== undefined) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardKey, sk: `TASK#${taskId}` },
        UpdateExpression: 'SET assignee = :a, updatedAt = :ts',
        ExpressionAttributeValues: { ':a': patch.assignee, ':ts': now },
      }))
      return { ok: true, task: (await this.getTaskLegacy(taskId, { board })).task }
    }

    if (patch.title !== undefined) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardKey, sk: `TASK#${taskId}` },
        UpdateExpression: 'SET title = :t, updatedAt = :ts',
        ExpressionAttributeValues: { ':t': patch.title, ':ts': now },
      }))
      return { ok: true, task: (await this.getTaskLegacy(taskId, { board })).task }
    }

    if (patch.priority !== undefined) {
      await ddb.send(new UpdateCommand({
        TableName: TABLES.kanban,
        Key: { pk: boardKey, sk: `TASK#${taskId}` },
        UpdateExpression: 'SET priority = :p, updatedAt = :ts',
        ExpressionAttributeValues: { ':p': patch.priority, ':ts': now },
      }))
      return { ok: true, task: (await this.getTaskLegacy(taskId, { board })).task }
    }

    throw new Error('No recognized update field')
  }

  private async updateTaskNative(taskId: string, patch: UpdateTaskInput, board = 'default'): Promise<{ ok: true; task?: KanbanTask }> {
    const params = new URLSearchParams({ board })
    const body: Record<string, unknown> = {}
    if (patch.archived) body.status = 'archived'
    if (patch.status) body.status = patch.status
    if (patch.assignee !== undefined) body.assignee = patch.assignee
    if (patch.title !== undefined) body.title = patch.title
    if (patch.body !== undefined) body.body = patch.body
    if (patch.priority !== undefined) body.priority = priorityStringToNative(patch.priority)
    if (patch.result !== undefined) body.result = patch.result
    if (patch.summary !== undefined) body.summary = patch.summary
    if (patch.metadata !== undefined) body.metadata = patch.metadata
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

  private async addCommentLegacy(taskId: string, text: string, senderName: string, board = 'default'): Promise<{ ok: true; commentId: string }> {
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
    await ddb.send(new UpdateCommand({
      TableName: TABLES.kanban,
      Key: { pk: boardPk(board), sk: `TASK#${taskId}` },
      UpdateExpression: 'SET commentCount = if_not_exists(commentCount, :zero) + :inc, updatedAt = :ts',
      ExpressionAttributeValues: { ':zero': 0, ':inc': 1, ':ts': now },
    })).catch(() => {})
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
    if (detail.task.archivedAt || detail.task.nativeStatus === 'archived' || detail.task.status === 'done') {
      throw new Error('task is already finished')
    }
    if (!detail.task.assignee) {
      throw new Error('assign the task before dispatching')
    }
    if (detail.task.status === 'triage') {
      throw new Error('triage tasks must be specified before dispatch')
    }
    if (detail.task.status === 'running') {
      throw new Error('task is already running')
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
