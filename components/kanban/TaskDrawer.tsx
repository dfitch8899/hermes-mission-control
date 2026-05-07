'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, MessageSquare, Send, Archive, Bot, Play, Clock3, Workflow, FileText } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { KanbanBackend, KanbanComment, KanbanEvent, KanbanRun, KanbanTask, KanbanTaskLog } from '@/types/kanban'

const AGENT_COLORS: Record<string, string> = {
  general: '#3cd7ff',
  coding: '#4ade80',
  marketing: '#f97316',
  research: '#a78bfa',
}
const AGENT_ICONS: Record<string, string> = {
  general: '✨',
  coding: '💻',
  marketing: '📢',
  research: '🔬',
}
const STATUS_LABELS: Record<string, string> = {
  triage: 'Triage',
  todo: 'To Do',
  ready: 'Ready',
  running: 'Running',
  blocked: 'Blocked',
  done: 'Done',
}
const STATUS_COLORS: Record<string, string> = {
  triage: '#859398',
  todo: '#3cd7ff',
  ready: '#5df6e0',
  running: '#4ade80',
  blocked: '#f97316',
  done: '#a78bfa',
}

interface Props {
  task: KanbanTask
  onClose: () => void
  onUpdate: (taskId: string, patch: Record<string, unknown>) => Promise<KanbanTask | undefined>
  onLaunchInChat?: (task: KanbanTask) => void
}

interface TaskDetailResponse {
  task?: KanbanTask
  comments?: KanbanComment[]
  events?: KanbanEvent[]
  runs?: KanbanRun[]
  canDispatch?: boolean
  canLaunchInChat?: boolean
  backend?: KanbanBackend
  log?: KanbanTaskLog
}

function formatTimestamp(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function summarizeEvent(event: KanbanEvent) {
  const payload = event.payload ?? {}
  switch (event.kind) {
    case 'created':
    case 'create':
      return 'Task created'
    case 'comment':
    case 'commented':
      return typeof payload.body === 'string' ? payload.body : 'Comment added'
    case 'blocked':
    case 'block':
      return typeof payload.reason === 'string' ? `Blocked: ${payload.reason}` : 'Task blocked'
    case 'unblocked':
    case 'unblock':
      return typeof payload.reason === 'string' ? `Unblocked: ${payload.reason}` : 'Task unblocked'
    case 'completed':
    case 'complete':
      return typeof payload.summary === 'string' ? `Completed: ${payload.summary}` : 'Task completed'
    case 'claimed':
      return 'Worker claimed task'
    case 'heartbeat':
      return 'Worker heartbeat'
    case 'archived':
    case 'archive':
      return 'Task archived'
    default:
      return event.kind.replace(/_/g, ' ')
  }
}

export default function TaskDrawer({ task, onClose, onUpdate, onLaunchInChat }: Props) {
  const [currentTask, setCurrentTask] = useState<KanbanTask>(task)
  const [comments, setComments] = useState<KanbanComment[]>([])
  const [events, setEvents] = useState<KanbanEvent[]>([])
  const [runs, setRuns] = useState<KanbanRun[]>([])
  const [log, setLog] = useState<KanbanTaskLog>({ exists: false, content: '', truncated: false })
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [canDispatch, setCanDispatch] = useState(false)
  const [canLaunchInChat, setCanLaunchInChat] = useState(Boolean(onLaunchInChat))
  const [backend, setBackend] = useState<KanbanBackend>('legacy')
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState(task.assignee)

  useEffect(() => { setCurrentTask(task) }, [task])
  useEffect(() => { setSelectedAgent(currentTask.assignee) }, [currentTask.assignee])

  useEffect(() => {
    let cancelled = false
    const boardParam = task.boardSlug ? `?board=${encodeURIComponent(task.boardSlug)}` : ''

    Promise.all([
      fetch(`/api/kanban/${task.taskId}${boardParam}`).then(async response => ({ ok: response.ok, data: await response.json().catch(() => null) })),
      fetch('/api/agents').then(async response => ({ ok: response.ok, data: await response.json().catch(() => null) })),
    ]).then(([taskResult, agentResult]) => {
      if (cancelled) return
      if (taskResult.ok && taskResult.data) {
        const data = taskResult.data as TaskDetailResponse
        if (data.task) setCurrentTask(data.task)
        setComments(data.comments ?? [])
        setEvents((data.events ?? []).slice().sort((a, b) => b.ts.localeCompare(a.ts)))
        setRuns((data.runs ?? []).slice().sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '')))
        setCanDispatch(Boolean(data.canDispatch))
        setCanLaunchInChat(Boolean(data.canLaunchInChat) && Boolean(onLaunchInChat))
        setBackend(data.backend === 'native' ? 'native' : 'legacy')
        setLog(data.log ?? { exists: false, content: '', truncated: false })
      }
      if (agentResult.ok && agentResult.data?.agents) {
        setAgents(agentResult.data.agents as Agent[])
      }
    }).catch(() => {})

    return () => { cancelled = true }
  }, [task.taskId, task.boardSlug, onLaunchInChat])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const boardParam = currentTask.boardSlug ? `?board=${encodeURIComponent(currentTask.boardSlug)}` : ''
  const agentColor = AGENT_COLORS[currentTask.assignee] ?? '#3cd7ff'
  const agentIcon = AGENT_ICONS[currentTask.assignee] ?? '✨'
  const statusColor = STATUS_COLORS[currentTask.status] ?? '#859398'

  const dispatchHint = useMemo(() => {
    if (backend !== 'native') return null
    if (currentTask.archivedAt || currentTask.status === 'done') return 'Finished tasks cannot be dispatched.'
    if (currentTask.status === 'running') return 'This task is already running.'
    if (!currentTask.assignee) return 'Assign this task before dispatching.'
    if (currentTask.status === 'triage') return 'Move the task out of triage before dispatching.'
    if (!canDispatch) return 'This task is not currently dispatchable.'
    return null
  }, [backend, currentTask, canDispatch])

  const sendComment = async () => {
    const text = commentText.trim()
    if (!text || sendingComment) return
    setSendingComment(true)
    try {
      const response = await fetch(`/api/kanban/${currentTask.taskId}/comments${boardParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!response.ok) throw new Error(`comment failed: ${response.status}`)
      const optimistic = {
        commentId: Date.now().toString(),
        body: text,
        author: 'Mission Control',
        ts: new Date().toISOString(),
      }
      setCommentText('')
      setComments(prev => [...prev, optimistic])
      setCurrentTask(prev => ({ ...prev, commentCount: prev.commentCount + 1, updatedAt: optimistic.ts }))
    } finally {
      setSendingComment(false)
    }
  }

  const applyUpdate = async (patch: Record<string, unknown>) => {
    const previous = currentTask
    setCurrentTask(prev => ({ ...prev, ...patch }))
    try {
      const updated = await onUpdate(currentTask.taskId, patch)
      if (updated) setCurrentTask(prev => ({ ...prev, ...updated }))
      return updated
    } catch (error) {
      setCurrentTask(previous)
      throw error
    }
  }

  const handleAgentChange = async (nextAgent: string) => {
    const previousAgent = currentTask.assignee
    setSelectedAgent(nextAgent)
    try {
      const updated = await applyUpdate({ assignee: nextAgent })
      if (updated) {
        setCanDispatch(
          backend === 'native'
          && Boolean(nextAgent)
          && ['ready', 'todo', 'blocked'].includes(updated.nativeStatus ?? updated.status),
        )
      }
    } catch {
      setSelectedAgent(previousAgent)
    }
  }

  const handleDispatch = async () => {
    if (dispatching) return
    setDispatching(true)
    try {
      const response = await fetch(`/api/kanban/${currentTask.taskId}/dispatch${boardParam}`, { method: 'POST' })
      if (!response.ok) throw new Error(`dispatch failed: ${response.status}`)
      const data = await response.json().catch(() => null) as { task?: KanbanTask } | null
      if (data?.task) {
        setCurrentTask(prev => ({ ...prev, ...data.task }))
        setCanDispatch(false)
      }
    } finally {
      setDispatching(false)
    }
  }

  const showDispatch = backend === 'native' && canDispatch && currentTask.status !== 'done' && !currentTask.archivedAt
  const showChatLaunch = backend !== 'native' && canLaunchInChat && currentTask.status !== 'done' && !currentTask.archivedAt

  const inputBase = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#dde2f9',
    fontSize: 12,
    padding: '8px 12px',
    outline: 'none',
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden" style={{ width: 460, background: '#0d1323', borderLeft: '1px solid rgba(255,255,255,0.09)', boxShadow: '-16px 0 60px rgba(0,0,0,0.5)' }}>
        <div className="flex items-start justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}33` }}>
                {STATUS_LABELS[currentTask.status] ?? currentTask.status}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: `${agentColor}12`, color: agentColor }}>
                {agentIcon} {currentTask.assignee}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase" style={{ background: 'rgba(255,255,255,0.05)', color: backend === 'native' ? '#5df6e0' : '#859398' }}>
                {backend}
              </span>
              {currentTask.priority !== 'normal' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full capitalize" style={{ background: currentTask.priority === 'critical' ? 'rgba(239,68,68,0.12)' : currentTask.priority === 'high' ? 'rgba(249,115,22,0.12)' : 'rgba(133,147,152,0.12)', color: currentTask.priority === 'critical' ? '#ef4444' : currentTask.priority === 'high' ? '#f97316' : '#859398' }}>
                  {currentTask.priority}
                </span>
              )}
            </div>
            <h2 className="text-sm font-semibold leading-snug" style={{ color: '#dde2f9' }}>{currentTask.title}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded transition-colors" style={{ color: '#859398' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {currentTask.body && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Description</div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(221,226,249,0.7)' }}>{currentTask.body}</p>
            </div>
          )}

          {currentTask.tags && currentTask.tags.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {currentTask.tags.map(tag => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-md font-mono" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#859398' }}>{tag}</span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#859398' }}>
              <div className="mb-1 text-[9px] uppercase tracking-widest">Created</div>
              <div style={{ color: '#dde2f9' }}>{formatTimestamp(currentTask.createdAt)}</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#859398' }}>
              <div className="mb-1 text-[9px] uppercase tracking-widest">Updated</div>
              <div style={{ color: '#dde2f9' }}>{formatTimestamp(currentTask.updatedAt)}</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#859398' }}>
              <div className="mb-1 text-[9px] uppercase tracking-widest">Dependencies</div>
              <div style={{ color: '#dde2f9' }}>{currentTask.parentCount ?? currentTask.parentIds.length} parents · {currentTask.childCount ?? currentTask.childIds.length} children</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#859398' }}>
              <div className="mb-1 text-[9px] uppercase tracking-widest">Comments</div>
              <div style={{ color: '#dde2f9' }}>{comments.length || currentTask.commentCount}</div>
            </div>
          </div>

          {(showDispatch || showChatLaunch || dispatchHint) && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Execution</div>
              {showDispatch && (
                <div className="flex flex-col gap-2">
                  <button onClick={() => void handleDispatch()} disabled={dispatching} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-mono font-semibold transition-all disabled:opacity-60" style={{ background: 'linear-gradient(135deg, rgba(60,215,255,0.15), rgba(93,246,224,0.15))', border: '1px solid rgba(93,246,224,0.3)', color: '#5df6e0' }}>
                    <Play size={14} /> {dispatching ? 'Dispatching…' : 'Nudge Dispatcher'}
                  </button>
                  <div className="text-[10px] font-mono" style={{ color: '#859398' }}>
                    Dispatching is board-scoped in native Hermes; a higher-priority ready task may be picked first.
                  </div>
                </div>
              )}
              {showChatLaunch && (
                <button onClick={() => onLaunchInChat?.(currentTask)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-mono font-semibold transition-all" style={{ background: 'linear-gradient(135deg, rgba(60,215,255,0.15), rgba(93,246,224,0.15))', border: '1px solid rgba(93,246,224,0.3)', color: '#5df6e0' }}>
                  <Bot size={14} /> Carry Out with Hermes
                </button>
              )}
              {!showDispatch && !showChatLaunch && dispatchHint && (
                <div className="text-[11px] leading-relaxed rounded-xl p-3 mt-0" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#859398' }}>
                  {dispatchHint}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Actions</div>
            <div className="flex flex-wrap gap-2">
              {currentTask.status !== 'done' && (
                <button onClick={() => void applyUpdate({ status: 'done' })} className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all" style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa' }}>
                  ✓ Mark Done
                </button>
              )}
              {currentTask.status !== 'blocked' && currentTask.status !== 'done' && (
                <button onClick={() => void applyUpdate({ status: 'blocked', reason: 'blocked from UI' })} className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all" style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316' }}>
                  ⊘ Block
                </button>
              )}
              {currentTask.status === 'blocked' && (
                <button onClick={() => void applyUpdate({ status: 'ready' })} className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all" style={{ background: 'rgba(93,246,224,0.1)', border: '1px solid rgba(93,246,224,0.25)', color: '#5df6e0' }}>
                  ↑ Unblock
                </button>
              )}
              {!currentTask.archivedAt && (
                <button onClick={() => void applyUpdate({ archived: true })} className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all flex items-center gap-1" style={{ background: 'rgba(133,147,152,0.08)', border: '1px solid rgba(133,147,152,0.2)', color: '#859398' }}>
                  <Archive size={11} /> Archive
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Reassign</div>
            <select value={selectedAgent} onChange={event => void handleAgentChange(event.target.value)} style={{ ...inputBase, width: '100%', cursor: 'pointer' }}>
              {agents.map(agent => (
                <option key={agent.agentId} value={agent.agentId}>{agent.icon} {agent.name}</option>
              ))}
            </select>
          </div>

          {currentTask.resultSummary && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Latest summary</div>
              <div className="rounded-xl p-3 text-[12px] leading-relaxed whitespace-pre-wrap" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#dde2f9' }}>
                {currentTask.resultSummary}
              </div>
            </div>
          )}

          {runs.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: '#859398' }}>
                <Workflow size={11} /> Runs
              </div>
              <div className="flex flex-col gap-2">
                {runs.slice(0, 6).map(run => (
                  <div key={run.runId} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className="text-[11px] font-mono" style={{ color: '#dde2f9' }}>{run.profile ?? 'worker'} · {run.outcome ?? run.status ?? 'run'}</div>
                      <div className="text-[10px] font-mono" style={{ color: '#859398' }}>{formatTimestamp(run.startedAt)}</div>
                    </div>
                    {run.summary && <div className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(221,226,249,0.78)' }}>{run.summary}</div>}
                    {run.error && <div className="text-[11px] mt-2 whitespace-pre-wrap" style={{ color: '#fca5a5' }}>{run.error}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {events.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: '#859398' }}>
                <Clock3 size={11} /> Timeline
              </div>
              <div className="flex flex-col gap-2">
                {events.slice(0, 10).map(event => (
                  <div key={event.eventId} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className="text-[11px] font-mono capitalize" style={{ color: '#dde2f9' }}>{event.kind.replace(/_/g, ' ')}</div>
                      <div className="text-[10px] font-mono" style={{ color: '#859398' }}>{formatTimestamp(event.ts)}</div>
                    </div>
                    <div className="text-[12px] leading-relaxed" style={{ color: 'rgba(221,226,249,0.72)' }}>{summarizeEvent(event)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {log.exists && log.content && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: '#859398' }}>
                <FileText size={11} /> Worker Log
              </div>
              <div className="rounded-xl p-3" style={{ background: 'rgba(7,11,21,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <pre className="text-[11px] whitespace-pre-wrap break-words max-h-80 overflow-auto" style={{ color: '#dde2f9' }}>{log.content}</pre>
                {log.truncated && <div className="text-[10px] font-mono mt-2" style={{ color: '#859398' }}>Showing log tail.</div>}
              </div>
            </div>
          )}

          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: '#859398' }}>
              <MessageSquare size={11} /> Comments
            </div>
            <div className="flex flex-col gap-2 mb-3 max-h-72 overflow-y-auto pr-1">
              {comments.length === 0 ? (
                <div className="text-[11px] font-mono" style={{ color: '#859398' }}>No comments yet.</div>
              ) : comments.map(comment => (
                <div key={comment.commentId} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[11px] font-mono" style={{ color: '#dde2f9' }}>{comment.author}</span>
                    <span className="text-[10px] font-mono" style={{ color: '#859398' }}>{formatTimestamp(comment.ts)}</span>
                  </div>
                  <div className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(221,226,249,0.72)' }}>{comment.body}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea value={commentText} onChange={event => setCommentText(event.target.value)} placeholder="Add a comment…" rows={3} style={{ ...inputBase, flex: 1, resize: 'vertical' }} />
              <button onClick={() => void sendComment()} disabled={!commentText.trim() || sendingComment} className="self-end p-2.5 rounded-xl transition-all disabled:opacity-60" style={{ background: 'rgba(60,215,255,0.12)', border: '1px solid rgba(60,215,255,0.26)', color: '#3cd7ff' }}>
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
