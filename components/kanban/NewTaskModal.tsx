'use client'

import { useEffect, useState } from 'react'
import { X, ChevronDown } from 'lucide-react'
import type { Agent } from '@/types/agent'

interface Props {
  onClose:  () => void
  onCreate: (data: {
    title:          string
    description:    string
    assignee:       string
    priority:       string
    workspaceType:  string
    tenant:         string
    tags:           string[]
  }) => Promise<void>
}

export default function NewTaskModal({ onClose, onCreate }: Props) {
  const [title,         setTitle]         = useState('')
  const [description,   setDescription]   = useState('')
  const [assignee,      setAssignee]       = useState('general')
  const [priority,      setPriority]       = useState('normal')
  const [workspaceType, setWorkspaceType]  = useState('scratch')
  const [tenant,        setTenant]         = useState('')
  const [tagsRaw,       setTagsRaw]        = useState('')
  const [showAdvanced,  setShowAdvanced]   = useState(false)
  const [loading,       setLoading]        = useState(false)
  const [agents,        setAgents]         = useState<Agent[]>([])

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then(d => setAgents(d.agents ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    if (!title.trim() || loading) return
    setLoading(true)
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    try {
      await onCreate({ title: title.trim(), description, assignee, priority, workspaceType, tenant, tags })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#dde2f9',
    fontSize: 13,
    padding: '10px 14px',
    width: '100%',
    outline: 'none',
  }

  const labelStyle = {
    fontSize: 10,
    fontFamily: 'var(--font-mono, monospace)',
    color: '#859398',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    display: 'block',
    marginBottom: 6,
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: '#0d1323',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          maxHeight: '90vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <span className="font-semibold text-white">New Task</span>
          <button onClick={onClose} className="p-1 rounded hover:text-white transition-colors" style={{ color: '#859398' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex flex-col gap-4">
          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void submit() }}
              placeholder="What needs to be done?"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = 'rgba(60,215,255,0.4)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(60,215,255,0.4)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Assignee */}
          <div>
            <label style={labelStyle}>Assign to</label>
            <select
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {agents.map(a => (
                <option key={a.agentId} value={a.agentId}>
                  {a.icon} {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label style={labelStyle}>Priority</label>
            <div className="flex gap-2">
              {(['low', 'normal', 'high', 'critical'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className="flex-1 py-2 rounded-lg text-[11px] font-mono font-medium transition-all capitalize"
                  style={{
                    background: priority === p
                      ? p === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(60,215,255,0.12)'
                      : 'rgba(255,255,255,0.04)',
                    border: priority === p
                      ? p === 'critical' ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(60,215,255,0.35)'
                      : '1px solid rgba(255,255,255,0.08)',
                    color: priority === p
                      ? p === 'critical' ? '#ef4444' : '#3cd7ff'
                      : '#859398',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider self-start"
            style={{ color: '#859398' }}
          >
            <ChevronDown size={12} style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            {showAdvanced ? 'Hide' : 'Show'} advanced
          </button>

          {showAdvanced && (
            <>
              <div>
                <label style={labelStyle}>Tags (comma-separated)</label>
                <input
                  value={tagsRaw}
                  onChange={e => setTagsRaw(e.target.value)}
                  placeholder="e.g. backend, performance, urgent"
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = 'rgba(60,215,255,0.4)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
                />
              </div>
              <div>
                <label style={labelStyle}>Workspace type</label>
                <select
                  value={workspaceType}
                  onChange={e => setWorkspaceType(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="scratch">scratch (in-memory)</option>
                  <option value="worktree">worktree (git)</option>
                  <option value="dir:">dir:&lt;path&gt;</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Tenant</label>
                <input
                  value={tenant}
                  onChange={e => setTenant(e.target.value)}
                  placeholder="Optional tenant tag"
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = 'rgba(60,215,255,0.4)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex gap-3 px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#859398',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!title.trim() || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: title.trim() && !loading ? 'linear-gradient(135deg, #3cd7ff, #5df6e0)' : 'rgba(60,215,255,0.1)',
              color: title.trim() && !loading ? '#001f27' : 'rgba(60,215,255,0.4)',
              cursor: title.trim() && !loading ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}
