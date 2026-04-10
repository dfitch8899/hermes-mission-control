'use client'

import { useState, useEffect } from 'react'
import SlideOver from '@/components/ui/SlideOver'
import Badge from '@/components/ui/Badge'
import type { Task, TaskStatus, TaskAssignee, TaskPriority } from '@/types/task'
import { formatDistanceToNow } from 'date-fns'

interface TaskSlideOverProps {
  task: Task | null
  open: boolean
  onClose: () => void
  onSave: (task: Task) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
}

const priorityBadge = {
  critical: 'red' as const,
  high: 'amber' as const,
  medium: 'blue' as const,
  low: 'muted' as const,
}

export default function TaskSlideOver({ task, open, onClose, onSave, onDelete }: TaskSlideOverProps) {
  const [form, setForm] = useState<Partial<Task>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (task) setForm({ ...task })
  }, [task])

  if (!task) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ ...task, ...form } as Task)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this task?')) return
    setDeleting(true)
    try {
      await onDelete(task.taskId)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'rgba(13,19,35,0.8)',
    border: '0.5px solid rgba(255,255,255,0.1)',
    color: '#dde2f9',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '13px',
    fontFamily: 'var(--font-inter)',
    width: '100%',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#859398',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontFamily: 'var(--font-jetbrains-mono)',
    marginBottom: '6px',
    display: 'block',
  }

  return (
    <SlideOver open={open} onClose={onClose} title={task.taskId}>
      <div className="p-6 space-y-5">
        {/* Status + Priority badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={priorityBadge[task.priority]}>{task.priority}</Badge>
          <Badge variant="muted">{task.status}</Badge>
          <Badge variant={task.assignee === 'hermes' ? 'cyan' : task.assignee === 'human' ? 'teal' : 'muted'}>
            {task.assignee}
          </Badge>
          {task.source === 'hermes_auto' && <Badge variant="blue">AUTO</Badge>}
        </div>

        {/* Title */}
        <div>
          <label style={labelStyle}>Title</label>
          <input
            style={inputStyle}
            value={form.title || ''}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            onFocus={(e) => { e.target.style.borderColor = '#3cd7ff' }}
            onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
          />
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle}>Description</label>
          <textarea
            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', lineHeight: '1.5' }}
            value={form.description || ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            onFocus={(e) => { e.target.style.borderColor = '#3cd7ff' }}
            onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
          />
        </div>

        {/* Status */}
        <div>
          <label style={labelStyle}>Status</label>
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={form.status || task.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TaskStatus }))}
          >
            {(['suggested', 'queued', 'in_progress', 'done', 'possible'] as TaskStatus[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Priority + Assignee row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>Priority</label>
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.priority || task.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
            >
              {(['low', 'medium', 'high', 'critical'] as TaskPriority[]).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Assignee</label>
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={form.assignee || task.assignee}
              onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value as TaskAssignee }))}
            >
              {(['hermes', 'human', 'both'] as TaskAssignee[]).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label style={labelStyle}>Tags (comma-separated)</label>
          <input
            style={inputStyle}
            value={(form.tags || task.tags || []).join(', ')}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) }))}
            onFocus={(e) => { e.target.style.borderColor = '#3cd7ff' }}
            onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
          />
        </div>

        {/* Hermes Notes (read only if from hermes) */}
        {task.hermesNotes && (
          <div>
            <label style={labelStyle}>Hermes Notes</label>
            <div
              className="rounded p-3 text-[12px] leading-relaxed"
              style={{
                backgroundColor: 'rgba(60,215,255,0.05)',
                border: '0.5px solid rgba(60,215,255,0.2)',
                color: '#dde2f9',
                fontFamily: 'var(--font-jetbrains-mono)',
              }}
            >
              {task.hermesNotes}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="space-y-1 pt-2" style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
          <div className="flex justify-between text-[10px] font-mono" style={{ color: '#859398' }}>
            <span>Created</span>
            <span>{formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}</span>
          </div>
          <div className="flex justify-between text-[10px] font-mono" style={{ color: '#859398' }}>
            <span>Updated</span>
            <span>{formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}</span>
          </div>
          <div className="flex justify-between text-[10px] font-mono" style={{ color: '#859398' }}>
            <span>Source</span>
            <span>{task.source}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded text-[11px] font-bold uppercase tracking-widest transition-opacity duration-100"
            style={{
              background: 'linear-gradient(135deg,#3cd7ff,#5df6e0)',
              color: '#001f27',
              fontFamily: 'var(--font-jetbrains-mono)',
              opacity: saving ? 0.6 : 1,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 rounded text-[11px] font-bold uppercase tracking-widest transition-all duration-100"
            style={{
              backgroundColor: 'rgba(255,180,171,0.1)',
              color: '#ffb4ab',
              border: '0.5px solid rgba(255,180,171,0.25)',
              fontFamily: 'var(--font-jetbrains-mono)',
              opacity: deleting ? 0.6 : 1,
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}
          >
            {deleting ? '...' : 'Delete'}
          </button>
        </div>
      </div>
    </SlideOver>
  )
}
