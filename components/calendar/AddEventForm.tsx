'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { CalendarEvent } from '@/types/calendar'

interface AddEventFormProps {
  onClose: () => void
  onAdd: (event: Partial<CalendarEvent>) => Promise<void>
}

function parseCron(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return 'Invalid cron expression'

  const [min, hour, dom, month, dow] = parts

  if (min === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') return 'Every minute'
  if (dom === '*' && month === '*' && dow === '*') {
    if (min === '0' && hour !== '*') return `Every day at ${hour.padStart(2, '0')}:00 UTC`
    if (min !== '*' && hour !== '*') return `Every day at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`
  }
  if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`
  if (dow !== '*') {
    const days: Record<string, string> = { '0': 'Sunday', '1': 'Monday', '2': 'Tuesday', '3': 'Wednesday', '4': 'Thursday', '5': 'Friday', '6': 'Saturday', 'MON': 'Monday', 'TUE': 'Tuesday', 'WED': 'Wednesday', 'THU': 'Thursday', 'FRI': 'Friday', 'SAT': 'Saturday', 'SUN': 'Sunday' }
    return `Every ${days[dow] || dow} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`
  }
  return expr
}

export default function AddEventForm({ onClose, onAdd }: AddEventFormProps) {
  const [type, setType] = useState<'cron' | 'planned'>('cron')
  const [title, setTitle] = useState('')
  const [cron, setCron] = useState('0 2 * * *')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)

  const cronPreview = type === 'cron' ? parseCron(cron) : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title) return
    setSaving(true)
    try {
      await onAdd({
        title,
        type,
        ...(type === 'cron' ? { cronExpression: cron, cronHumanReadable: cronPreview } : { scheduledAt }),
        description,
        nextRun: type === 'planned' && scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
        createdBy: 'user',
        lastRunStatus: 'never',
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#0D1117',
    border: '0.5px solid #30363D',
    color: '#E6EDF3',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '13px',
    fontFamily: 'var(--font-inter)',
    width: '100%',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#8B949E',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    fontFamily: 'var(--font-jetbrains-mono)',
    marginBottom: '6px',
    display: 'block',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded"
        style={{ backgroundColor: '#161B22', border: '0.5px solid #30363D' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '0.5px solid #30363D' }}
        >
          <span className="text-[11px] font-headline font-bold uppercase tracking-widest" style={{ color: '#FFB300' }}>
            Add Event
          </span>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded" style={{ color: '#8B949E' }}>
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label style={labelStyle}>Title</label>
            <input
              style={inputStyle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              onFocus={(e) => { e.target.style.borderColor = '#FFB300' }}
              onBlur={(e) => { e.target.style.borderColor = '#30363D' }}
            />
          </div>

          {/* Type toggle */}
          <div>
            <label style={labelStyle}>Type</label>
            <div className="flex gap-2">
              {(['cron', 'planned'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="flex-1 py-2 rounded text-[11px] font-mono uppercase tracking-widest transition-all duration-100"
                  style={{
                    backgroundColor: type === t ? (t === 'cron' ? 'rgba(255,179,0,0.12)' : 'rgba(20,184,166,0.12)') : '#0D1117',
                    border: `0.5px solid ${type === t ? (t === 'cron' ? '#FFB300' : '#14B8A6') : '#30363D'}`,
                    color: type === t ? (t === 'cron' ? '#FFB300' : '#14B8A6') : '#8B949E',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Cron or date */}
          {type === 'cron' ? (
            <div>
              <label style={labelStyle}>Cron Expression</label>
              <input
                style={{ ...inputStyle, fontFamily: 'var(--font-jetbrains-mono)' }}
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="0 2 * * *"
                onFocus={(e) => { e.target.style.borderColor = '#FFB300' }}
                onBlur={(e) => { e.target.style.borderColor = '#30363D' }}
              />
              {cronPreview && (
                <p className="mt-1 text-[11px] font-mono" style={{ color: '#14B8A6' }}>
                  {cronPreview}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label style={labelStyle}>Scheduled Date & Time</label>
              <input
                type="datetime-local"
                style={{ ...inputStyle, colorScheme: 'dark' }}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                onFocus={(e) => { e.target.style.borderColor = '#FFB300' }}
                onBlur={(e) => { e.target.style.borderColor = '#30363D' }}
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label style={labelStyle}>Description (optional)</label>
            <textarea
              style={{ ...inputStyle, minHeight: '70px', resize: 'vertical', lineHeight: '1.5' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onFocus={(e) => { e.target.style.borderColor = '#FFB300' }}
              onBlur={(e) => { e.target.style.borderColor = '#30363D' }}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || !title}
            className="w-full py-2.5 rounded text-[11px] font-bold uppercase tracking-widest transition-opacity duration-100"
            style={{
              backgroundColor: '#FFB300',
              color: '#0D1117',
              fontFamily: 'var(--font-jetbrains-mono)',
              opacity: saving || !title ? 0.5 : 1,
              cursor: saving || !title ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Adding...' : 'Add Event'}
          </button>
        </form>
      </div>
    </div>
  )
}
