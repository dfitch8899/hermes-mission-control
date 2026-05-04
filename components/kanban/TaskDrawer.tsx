'use client'

import { useEffect, useState } from 'react'
import { X, MessageSquare, Send, Archive } from 'lucide-react'
import type { KanbanTask, KanbanComment } from '@/types/kanban'
import type { Agent } from '@/types/agent'

const AGENT_COLORS: Record<string, string> = {
  general:   '#3cd7ff',
  coding:    '#4ade80',
  marketing: '#f97316',
  research:  '#a78bfa',
}
const AGENT_ICONS: Record<string, string> = {
  general:   '✨',
  coding:    '💻',
  marketing: '📢',
  research:  '🔬',
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
  task:     KanbanTask
  onClose:  () => void
  onUpdate: (taskId: string, patch: Record<string, unknown>) => Promise<void>
}

export default function TaskDrawer({ task, onClose, onUpdate }: Props) {
  const [comments,     setComments]     = useState<KanbanComment[]>([])
  const [commentText,  setCommentText]  = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [agents,       setAgents]       = useState<Agent[]>([])

  // Fetch task detail (with comments) and agent list
  useEffect(() => {
    Promise.all([
      fetch(`/api/kanban/${task.taskId}`).then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
    ]).then(([taskData, agentData]) => {
      if (taskData.comments) setComments(taskData.comments)
      if (agentData.agents)  setAgents(agentData.agents)
    }).catch(() => {})
  }, [task.taskId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sendComment = async () => {
    const text = commentText.trim()
    if (!text || sendingComment) return
    setSendingComment(true)
    try {
      await fetch(`/api/kanban/${task.taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      setCommentText('')
      // Optimistic local update
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

  const agentColor = AGENT_COLORS[task.assignee] ?? '#3cd7ff'
  const agentIcon  = AGENT_ICONS[task.assignee]  ?? '✨'
  const statusColor = STATUS_COLORS[task.status] ?? '#859398'

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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
        style={{
          width: 420,
          background: '#0d1323',
          borderLeft: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '-16px 0 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}33` }}
              >
                {STATUS_LABELS[task.status] ?? task.status}
              </span>
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                style={{ background: `${agentColor}12`, color: agentColor }}
              >
                {agentIcon} {task.assignee}
              </span>
            </div>
            <h2 className="text-sm font-semibold leading-snug" style={{ color: '#dde2f9' }}>
              {task.title}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded transition-colors" style={{ color: '#859398' }}>
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* Body */}
          {task.body && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Description</div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(221,226,249,0.7)' }}>
                {task.body}
              </p>
            </div>
          )}

          {/* Quick actions */}
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Actions</div>
            <div className="flex flex-wrap gap-2">
              {task.status !== 'done' && (
                <button
                  onClick={() => void onUpdate(task.taskId, { status: 'done' })}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all"
                  style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa' }}
                >
                  ✓ Mark Done
                </button>
              )}
              {task.status !== 'blocked' && task.status !== 'done' && (
                <button
                  onClick={() => void onUpdate(task.taskId, { status: 'blocked', reason: 'blocked from UI' })}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all"
                  style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316' }}
                >
                  ⊘ Block
                </button>
              )}
              {task.status === 'blocked' && (
                <button
                  onClick={() => void onUpdate(task.taskId, { status: 'ready' })}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all"
                  style={{ background: 'rgba(93,246,224,0.1)', border: '1px solid rgba(93,246,224,0.25)', color: '#5df6e0' }}
                >
                  ↑ Unblock
                </button>
              )}
              {!task.archivedAt && (
                <button
                  onClick={() => void onUpdate(task.taskId, { archived: true })}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all flex items-center gap-1"
                  style={{ background: 'rgba(133,147,152,0.08)', border: '1px solid rgba(133,147,152,0.2)', color: '#859398' }}
                >
                  <Archive size={11} /> Archive
                </button>
              )}
            </div>
          </div>

          {/* Re-assign */}
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: '#859398' }}>Reassign</div>
            <select
              defaultValue={task.assignee}
              onChange={e => void onUpdate(task.taskId, { assignee: e.target.value })}
              style={{ ...inputBase, width: '100%', cursor: 'pointer' }}
            >
              {agents.map(a => (
                <option key={a.agentId} value={a.agentId}>{a.icon} {a.name}</option>
              ))}
            </select>
          </div>

          {/* Metadata */}
          <div
            className="rounded-xl px-4 py-3 text-[10px] font-mono space-y-1.5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex justify-between">
              <span style={{ color: '#859398' }}>Task ID</span>
              <span style={{ color: '#dde2f9' }}>{task.taskId}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#859398' }}>Priority</span>
              <span style={{ color: '#dde2f9' }}>{task.priority}</span>
            </div>
            {task.workspaceType && (
              <div className="flex justify-between">
                <span style={{ color: '#859398' }}>Workspace</span>
                <span style={{ color: '#dde2f9' }}>{task.workspaceType}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span style={{ color: '#859398' }}>Created</span>
              <span style={{ color: '#dde2f9' }}>{new Date(task.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Comments */}
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
                {comments.map(c => (
                  <div
                    key={c.commentId}
                    className="rounded-xl px-3 py-2.5"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono font-medium" style={{ color: '#5df6e0' }}>{c.author}</span>
                      <span className="text-[9px] font-mono" style={{ color: '#859398' }}>
                        {new Date(c.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(221,226,249,0.8)' }}>
                      {c.body}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Comment composer */}
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
