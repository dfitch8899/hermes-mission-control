'use client'

import { useState, useEffect } from 'react'
import SlideOver from '@/components/ui/SlideOver'
import Badge from '@/components/ui/Badge'
import type { Task, TaskStatus, TaskAssignee, TaskPriority } from '@/types/task'
import { formatDistanceToNow } from 'date-fns'
import { Bot, Loader2 } from 'lucide-react'

interface TaskSlideOverProps {
  task: Task | null
  open: boolean
  onClose: () => void
  onSave: (task: Task) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
  onExecute: (task: Task) => Promise<void>
}

const priorityBadge = {
  critical: 'red' as const,
  high: 'amber' as const,
  medium: 'blue' as const,
  low: 'muted' as const,
}

export default function TaskSlideOver({ task, open, onClose, onSave, onDelete, onExecute }: TaskSlideOverProps) {
  const [form, setForm] = useState<Partial<Task>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [executing, setExecuting] = useState(false)

  useEffect(() => {
    if (task) setForm({ ...task })
  }, [task])

  if (!task) return null

  const executeDisabled = executing || task.status === 'done' || task.status === 'in_progress'

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

  const handleExecute = async () => {
    setExecuting(true)
    try {
      await onExecute({ ...task, ...form } as Task)
      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to launch Hermes')
    } finally {
      setExecuting(false)
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
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={priorityBadge[task.priority]}>{task.priority}</Badge>
          <Badge variant="muted">{task.status}</Badge>
          <Badge variant={task.assignee === 'hermes' ? 'cyan' : task.assignee === 'human' ? 'teal' : 'muted'}>
            {task.assignee}
          </Badge>
          {task.source === 'hermes_auto' && <Badge variant="blue">AUTO</Badge>}
        </div>

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

        {task.hermesNotes && (
          <div>
            <label style={labelStyle}>Hermes Notes</label>
            <div
              className="rounded p-3 text-[12px] leading-relaxed whitespace-pre-wrap"
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

        <div className="space-y-3 pt-2">
          <button
            onClick={handleExecute}
            disabled={executeDisabled}
            className="w-full py-2.5 rounded text-[11px] font-bold uppercase tracking-widest transition-all duration-100 flex items-center justify-center gap-2"
            style={{
              background: executeDisabled
                ? 'rgba(133,147,152,0.08)'
                : 'linear-gradient(135deg, rgba(60,215,255,0.18), rgba(93,246,224,0.18))',
              color: executeDisabled ? '#859398' : '#5df6e0',
              border: executeDisabled
                ? '1px solid rgba(133,147,152,0.18)'
                : '1px solid rgba(93,246,224,0.24)',
              fontFamily: 'var(--font-jetbrains-mono)',
              opacity: executing ? 0.7 : 1,
              cursor: executeDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {executing ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
            {task.status === 'done'
              ? 'Task Complete'
              : task.status === 'in_progress'
                ? 'Task Already Running'
                : executing
                  ? 'Launching Hermes...'
                  : 'Carry Out with Hermes'}
          </button>

          <div className="flex gap-3">
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
      </div>
    </SlideOver>
  )
}
