/**
 * Shared types for the Hermes command client.
 * All transports (Slack relay, direct dashboard HTTP) implement HermesTransport.
 */

export interface PermissionRequest {
  ts:      string
  channel: string
  command: string
  reason:  string
}

/**
 * Status values MC sends to Hermes for plain drag-drop / triage transitions.
 * - `done` and `blocked` go through dedicated kanbanComplete / kanbanBlock.
 * - `running` is reserved for Hermes' own dispatcher/claim path (the plugin
 *   rejects external PATCH attempts with HTTP 400) and is intentionally
 *   excluded here.
 */
export type KanbanPlainStatus = 'triage' | 'todo' | 'ready'

/**
 * Fields MC sends to the Hermes plugin's POST /api/plugins/kanban/tasks.
 * Mirrors CreateTaskBody in the Hermes plugin (hermes_cli plugin_api.py).
 * Tags are intentionally omitted: the Hermes plugin doesn't model them yet.
 */
export interface KanbanCreateInput {
  title:          string
  description?:   string
  assignee?:      string
  priority?:      'low' | 'normal' | 'high' | 'critical'
  workspaceType?: string
  tenant?:        string
  board?:         string
  /** If true, lands the task in the triage column; otherwise default 'todo'. */
  triage?:        boolean
}

export interface ChatSendOptions {
  text:                string
  senderName:          string
  agentId?:            string
  /** Called each time a new permission-approval prompt arrives from Hermes. */
  onPermissionRequest: (req: PermissionRequest) => void
  /** Called each time the accumulated Hermes reply text changes. */
  onTextUpdate:        (text: string) => void
}

/**
 * The contract every transport must satisfy.
 * Add new methods here when new Hermes features need to be bridged.
 */
export interface HermesTransport {
  /**
   * Send a chat message to Hermes and stream the reply via callbacks.
   * Returns the final assembled text (or null on timeout).
   */
  chatSend(opts: ChatSendOptions): Promise<string | null>

  /**
   * Create a kanban task in Hermes (the source of truth). The Hermes plugin
   * generates the task id and writes to its own SQLite; kanban_mirror.py
   * then echoes the new task back into DynamoDB. Returns the assigned id.
   *
   * Strict — throws on failure. A swallowed create would silently drop the
   * task, since MC no longer writes a local DDB copy.
   */
  kanbanCreate(input: KanbanCreateInput): Promise<string>

  /**
   * Set the status of an existing kanban task in Hermes. Used for the
   * triage/todo/ready transitions that previously bypassed Hermes.
   * `running` is rejected by Hermes (use the dispatcher/claim path);
   * `done`/`blocked` have their own dedicated methods below.
   */
  kanbanSetStatus(taskId: string, status: KanbanPlainStatus, board?: string): Promise<void>

  /**
   * Notify Hermes a kanban task was completed (workspace cleanup side-effect).
   * Fire-and-forget — does not throw on failure.
   */
  kanbanComplete(taskId: string, result: string | undefined, senderName: string): Promise<void>

  /**
   * Notify Hermes a kanban task is blocked.
   * Fire-and-forget — does not throw on failure.
   */
  kanbanBlock(taskId: string, reason: string | undefined, senderName: string): Promise<void>

  /**
   * Post a comment to a kanban task in Hermes (so Hermes's SQLite stays in sync).
   */
  kanbanComment(taskId: string, text: string, senderName: string): Promise<void>

  /**
   * Set the active model in Hermes (so config.yaml is updated live).
   * Fire-and-forget — does not throw on failure.
   */
  modelSet(model: string): Promise<void>

  /**
   * Run a command on Hermes (terminal commands, memory sync, etc.).
   * Returns the command's output text when called via direct transport;
   * returns undefined when called via fire-and-forget Slack relay.
   * Does not throw on failure — errors surface as returned text or logs.
   */
  exec(command: string, senderName?: string): Promise<string | undefined>
}
