'use client'

import React, { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import type { Task, TaskPriority, TaskAssignee } from '@/types/task'

interface NewTaskModalProps {
  open: boolean
  onClose: () => void
  onCreated: (task: Task) => void
}

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  color: '#859398',
  display: 'block',
  marginBottom: '6px',
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  color: '#dde2f9',
  padding: '8px 12px',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}

// Focus-aware input subcomponents

const FocusInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => {
    const [focused, setFocused] = useState(false)
    return (
      <input
        ref={ref}
        {...props}
        style={{ ...INPUT_STYLE, border: focused ? '1px solid rgba(60,215,255,0.3)' : '1px solid rgba(255,255,255,0.08)' }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    )
  }
)
FocusInput.displayName = 'FocusInput'

function FocusTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      {...props}
      style={{
        ...INPUT_STYLE,
        resize: 'vertical',
        border: focused ? '1px solid rgba(60,215,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}

function FocusSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [focused, setFocused] = useState(false)
  return (
    <select
      {...props}
      style={{
        ...INPUT_STYLE,
        cursor: 'pointer',
        border: focused ? '1px solid rgba(60,215,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}

export default function NewTaskModal({ open, onClose, onCreated }: NewTaskModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [assignee, setAssignee] = useState<TaskAssignee>('hermes')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTitle('')
      setDescription('')
      setPriority('medium')
      setAssignee('hermes')
      setError(null)
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priority,
          assignee,
          status: 'queued',
          source: 'manual',
          tags: [],
        }),
      })
      if (!res.ok) throw new Error('Request failed')
      const data = await res.json()
      onCreated(data.task)
      onClose()
    } catch {
      setError('Failed to create task. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: 'rgba(25,31,48,0.9)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '480px',
          padding: '24px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#3cd7ff' }}>
            New Task
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#859398', padding: '2px', display: 'flex' }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div style={{ marginBottom: '16px' }}>
            <label style={LABEL_STYLE}>Title *</label>
            <FocusInput
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '16px' }}>
            <label style={LABEL_STYLE}>Description</label>
            <FocusTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </div>

          {/* Priority + Assignee row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
            <div>
              <label style={LABEL_STYLE}>Priority</label>
              <FocusSelect value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </FocusSelect>
            </div>
            <div>
              <label style={LABEL_STYLE}>Assignee</label>
              <FocusSelect value={assignee} onChange={(e) => setAssignee(e.target.value as TaskAssignee)}>
                <option value="hermes">Hermes</option>
                <option value="human">Human</option>
              </FocusSelect>
            </div>
          </div>

          {error && (
            <p style={{ color: '#ff6b6b', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', marginBottom: '12px' }}>
              {error}
            </p>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#859398', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: 'rgba(60,215,255,0.08)',
                border: '1px solid rgba(60,215,255,0.25)',
                color: '#3cd7ff',
                borderRadius: '8px',
                padding: '8px 16px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
