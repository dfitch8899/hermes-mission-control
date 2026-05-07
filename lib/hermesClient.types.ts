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
   * Run an arbitrary command through Hermes (e.g. the memory sync script).
   * Fire-and-forget — does not throw on failure.
   */
  exec(command: string, senderName?: string): Promise<void>
}
