'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { CalendarEvent } from '@/types/calendar'
import EventFormFields, { eventToFormValues, parseSkillsText, type EventFormValues } from './EventFormFields'

interface Props {
  event: CalendarEvent
  onClose: () => void
  onSave: (eventId: string, updates: Partial<CalendarEvent>) => Promise<void>
}

export default function EditEventModal({ event, onClose, onSave }: Props) {
  const [values, setValues] = useState<EventFormValues>(eventToFormValues(event))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Schedule is required for cron edits; prompt is NOT required here.
  // Synced rows have an empty prompt in DDB (cron list doesn't return it)
  // and forcing a value would block edits to schedule/skills.  We only
  // send `prompt` to the server if the user actually typed one.
  const cronInvalid = values.type === 'cron' && !values.schedule.trim()
  const plannedInvalid = values.type === 'planned' && !values.scheduledAt
  const disabled = saving || !values.title || cronInvalid || plannedInvalid

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (disabled) return
    setSaving(true)
    setError(null)
    try {
      const skills = parseSkillsText(values.skillsText)
      const newScheduledAt = values.type === 'planned' && values.scheduledAt
        ? new Date(values.scheduledAt).toISOString()
        : event.scheduledAt
      const newSchedule = values.type === 'cron'
        ? values.schedule
        : newScheduledAt

      const updates: Partial<CalendarEvent> & { skills?: string[] } = {
        title: values.title,
        description: values.description || undefined,
        skills,
        schedule: newSchedule,
        scheduledAt: newScheduledAt,
      }
      // Only include `prompt` if the user actually typed one.  An empty
      // value would otherwise overwrite Hermes's real prompt with ''.
      if (values.prompt.trim()) updates.prompt = values.prompt

      await onSave(event.eventId, updates)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
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
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '0.5px solid #30363D' }}
        >
          <span className="text-[11px] font-headline font-bold uppercase tracking-widest" style={{ color: '#FFB300' }}>
            Edit Event
          </span>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded" style={{ color: '#8B949E' }}>
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <EventFormFields values={values} onChange={setValues} lockType />

          <p className="text-[10px] font-mono" style={{ color: '#8B949E' }}>
            Job ID: <code>{event.hermesJobId}</code>
          </p>

          {error && (
            <p className="text-[11px] font-mono" style={{ color: '#ffb4ab' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={disabled}
            className="w-full py-2.5 rounded text-[11px] font-bold uppercase tracking-widest transition-opacity duration-100"
            style={{
              backgroundColor: '#FFB300',
              color: '#0D1117',
              fontFamily: 'var(--font-jetbrains-mono)',
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  )
}
