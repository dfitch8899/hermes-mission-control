'use client'

import { useEffect, useState } from 'react'
import { X, MessageSquare, Send, Archive, Bot, Play } from 'lucide-react'
import type { KanbanTask, KanbanComment } from '@/types/kanban'
import type { Agent } from '@/types/agent'

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
  triage: 'Triage', todo: 'To Do', ready: 'Ready',
  running: 'Running', blocked: 'Blocked', done: 'Done',
}
const STATUS_COLORS: Record<string, string> = {
  triage: '#859398', todo: '#3cd7ff', ready: '#5df6e0',
  running: '#4ade80', blocked: '#f97316', done: '#a78bfa',
}

interface Props {
  task: KanbanTask
  onClose: () => void
  onUpdate: (taskId: string, patch: Record<string, unknown>) => Promise<void>
  onLaunchInChat?: (task: KanbanTask) => void
}

function formatTimestamp(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function TaskDrawer({ task, onClose, onUpdate, onLaunchInChat }: Props) {
  const [currentTask, setCurrentTask] = useState<KanbanTask>(task)
  const [comments, setComments] = useState<KanbanComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [canDispatch, setCanDispatch] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState(task.assignee)

  useEffect(() => {
    setCurrentTask(task)
  }, [task])

  useEffect(() => {
    setSelectedAgent(currentTask.assignee)
  }, [currentTask.assignee])

  useEffect(() => {
    let cancelled = false
    const boardParam = task.boardSlug ? `?board=${encodeURIComponent(task.boardSlug)}` : ''

    setComments([])
    setCanDispatch(false)

    Promise.all([
      fetch(`/api/kanban/${task.taskId}${boardParam}`).then(async response => ({ ok: response.ok, data: await response.json().catch(() => null) })),
      fetch('/api/agents').then(async response => ({ ok: response.ok, data: await response.json().catch(() => null) })),
    ]).then(([taskResult, agentResult]) => {
      if (cancelled) return
      if (taskResult.ok && taskResult.data?.task) {
        setCurrentTask(taskResult.data.task as KanbanTask)
        setCanDispatch(Boolean(taskResult.data.canDispatch))
        setComments((taskResult.data.comments as KanbanComment[]) ?? [])
      }
      if (agentResult.ok && agentResult.data?.agents) {
        setAgents(agentResult.data.agents as Agent[])
      }
    }).catch(() => {})

    return () => { cancelled = true }
  }, [task.taskId, task.boardSlug])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const boardParam = currentTask.boardSlug ? `?board=${encodeURIComponent(currentTask.boardSlug)}` : ''

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

      setCommentText('')
      setComments(prev => [...prev, {
        commentId: Date.now().toString(),
        body: text,
        author: 'me',
        ts: new Date().toISOString(),
      }])
    } finally {
      setSendingComment(false)
    }
  }

  const applyUpdate = async (patch: Record<string, unknown>) => {
    const previous = currentTask
    setCurrentTask(prev => ({ ...prev, ...patch }))
    try {
      await onUpdate(currentTask.taskId, patch)
    } catch (error) {
      setCurrentTask(previous)
      throw error
    }
  }

  const handleAgentChange = async (nextAgent: string) => {
    const previousAgent = currentTask.assignee
    setSelectedAgent(nextAgent)
    try {
      await applyUpdate({ assignee: nextAgent })
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
      if (data?.task) setCurrentTask(prev => ({ ...prev, ...data.task }))
    } finally {
      setDispatching(false)
    }
  }

  const agentColor = AGENT_COLORS[currentTask.assignee] ?? '#3cd7ff'
  const agentIcon = AGENT_ICONS[currentTask.assignee] ?? '✨'
  const statusColor = STATUS_COLORS[currentTask.status] ?? '#859398'

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
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
        style={{
          width: 440,
          background: '#0d1323',
          borderLeft: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '-16px 0 60px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="flex items-start justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}33` }}
              >
                {STATUS_LABELS[currentTask.status] ?? currentTask.status}
              </span>
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                style={{ background: `${agentColor}12`, color: agentColor }}
              >
                {agentIcon} {currentTask.assignee}
              </span>
              {currentTask.priority !== 'normal' && (
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full capitalize"
                  style={{
                    background: currentTask.priority === 'critical' ? 'rgba(239,68,68,0.12)' : currentTask.priority === 'high' ? 'rgba(249,115,22,0.12)' : 'rgba(133,147,152,0.12)',
                    color: currentTask.priority === 'critical' ? '#ef4444' : currentTask.priority === 'high' ? '#f97316' : '#859398',
                  }}
                >
                  {currentTask.priority}
                </span>
              )}
            </div>
            <h2 className="text-sm font-semibold leading-snug" style={{ color: '#dde2f9' }}>
              {currentTask.title}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded transition-colors" style={{ color: '#859398' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {currentTask.body && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Description</div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(221,226,249,0.7)' }}>
                {currentTask.body}
              </p>
            </div>
          )}

          {currentTask.tags && currentTask.tags.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {currentTask.tags.map(tag => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-md font-mono"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#859398',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(canDispatch || onLaunchInChat) && currentTask.status !== 'done' && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>
                {canDispatch ? 'Dispatch' : 'Launch'}
              </div>
              <button
                onClick={() => void (canDispatch ? handleDispatch() : onLaunchInChat?.(currentTask))}
                disabled={dispatching}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-mono font-semibold transition-all disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, rgba(60,215,255,0.15), rgba(93,246,224,0.15))',
                  border: '1px solid rgba(93,246,224,0.3)',
                  color: '#5df6e0',
                }}
              >
                {canDispatch ? <Play size={14} /> : <Bot size={14} />}
                {canDispatch ? (dispatching ? 'Dispatching…' : 'Dispatch Task') : 'Carry Out with Hermes'}
              </button>
            </div>
          )}

          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Actions</div>
            <div className="flex flex-wrap gap-2">
              {currentTask.status !== 'done' && (
                <button
                  onClick={() => void applyUpdate({ status: 'done' })}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all"
                  style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa' }}
                >
                  ✓ Mark Done
                </button>
              )}
              {currentTask.status !== 'blocked' && currentTask.status !== 'done' && (
                <button
                  onClick={() => void applyUpdate({ status: 'blocked', reason: 'blocked from UI' })}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all"
                  style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316' }}
                >
                  ⊘ Block
                </button>
              )}
              {currentTask.status === 'blocked' && (
                <button
                  onClick={() => void applyUpdate({ status: 'ready' })}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all"
                  style={{ background: 'rgba(93,246,224,0.1)', border: '1px solid rgba(93,246,224,0.25)', color: '#5df6e0' }}
                >
                  ↑ Unblock
                </button>
              )}
              {!currentTask.archivedAt && (
                <button
                  onClick={() => void applyUpdate({ archived: true })}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all flex items-center gap-1"
                  style={{ background: 'rgba(133,147,152,0.08)', border: '1px solid rgba(133,147,152,0.2)', color: '#859398' }}
                >
                  <Archive size={11} /> Archive
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Reassign</div>
            <select
              value={selectedAgent}
              onChange={e => { void handleAgentChange(e.target.value) }}
              style={{ ...inputBase, width: '100%', cursor: 'pointer' }}
            >
              {agents.map(agent => (
                <option key={agent.agentId} value={agent.agentId}>{agent.icon} {agent.name}</option>
              ))}
            </select>
          </div>

          <div
            className="rounded-xl px-4 py-3 text-[10px] font-mono space-y-1.5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex justify-between">
              <span style={{ color: '#859398' }}>Task ID</span>
              <span style={{ color: '#dde2f9' }}>{currentTask.taskId}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#859398' }}>Priority</span>
              <span style={{ color: '#dde2f9' }}>{currentTask.priority}</span>
            </div>
            {currentTask.workspaceType && (
              <div className="flex justify-between">
                <span style={{ color: '#859398' }}>Workspace</span>
                <span style={{ color: '#dde2f9' }}>{currentTask.workspaceType}</span>
              </div>
            )}
            {currentTask.boardSlug && (
              <div className="flex justify-between">
                <span style={{ color: '#859398' }}>Board</span>
                <span style={{ color: '#dde2f9' }}>{currentTask.boardSlug}</span>
              </div>
            )}
            {currentTask.claimedBy && (
              <div className="flex justify-between">
                <span style={{ color: '#859398' }}>Claimed By</span>
                <span style={{ color: '#4ade80' }}>{currentTask.claimedBy}</span>
              </div>
            )}
            {currentTask.activeRunId && (
              <div className="flex justify-between">
                <span style={{ color: '#859398' }}>Active Run</span>
                <span style={{ color: '#dde2f9' }}>{currentTask.activeRunId}</span>
              </div>
            )}
            {currentTask.lastHeartbeatAt && (
              <div className="flex justify-between">
                <span style={{ color: '#859398' }}>Heartbeat</span>
                <span style={{ color: '#dde2f9' }}>{formatTimestamp(currentTask.lastHeartbeatAt)}</span>
              </div>
            )}
            {currentTask.blockedReason && (
              <div className="flex justify-between gap-4 items-start">
                <span style={{ color: '#859398' }}>Blocked Reason</span>
                <span style={{ color: '#f97316', textAlign: 'right' }}>{currentTask.blockedReason}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span style={{ color: '#859398' }}>Created</span>
              <span style={{ color: '#dde2f9' }}>{formatTimestamp(currentTask.createdAt)}</span>
            </div>
            {currentTask.completedAt && (
              <div className="flex justify-between">
                <span style={{ color: '#859398' }}>Completed</span>
                <span style={{ color: '#a78bfa' }}>{formatTimestamp(currentTask.completedAt)}</span>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={12} style={{ color: '#859398' }} />
              <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: '#859398' }}>
                Comments ({comments.length})
              </span>
            </div>

            {comments.length === 0 ? (
              <div className="text-center py-4 text-[11px] font-mono" style={{ color: 'rgba(133,147,152,0.4)' }}>
                No comments yet
              </div>
            ) : (
              <div className="flex flex-col gap-2 mb-3">
                {comments.map(comment => (
                  <div
                    key={comment.commentId}
                    className="rounded-xl px-3 py-2.5"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono font-medium" style={{ color: '#5df6e0' }}>{comment.author}</span>
                      <span className="text-[9px] font-mono" style={{ color: '#859398' }}>
                        {new Date(comment.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(221,226,249,0.8)' }}>
                      {comment.body}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void sendComment() }}
                placeholder="Add a comment..."
                style={{ ...inputBase, flex: 1 }}
              />
              <button
                onClick={() => void sendComment()}
                disabled={!commentText.trim() || sendingComment}
                className="p-2 rounded-xl transition-all"
                style={{
                  background: commentText.trim() && !sendingComment ? 'rgba(60,215,255,0.15)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(60,215,255,0.2)',
                  color: commentText.trim() && !sendingComment ? '#3cd7ff' : '#859398',
                  cursor: commentText.trim() && !sendingComment ? 'pointer' : 'not-allowed',
                }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
