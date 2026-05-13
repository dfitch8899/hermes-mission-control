'use client'

import type { CalendarEvent } from '@/types/calendar'
import { describeSchedule } from './describeSchedule'

export interface EventFormValues {
  title: string
  type: 'cron' | 'planned'
  schedule: string
  scheduledAt: string       // datetime-local string for 'planned' type
  prompt: string
  skillsText: string        // comma-separated raw input
  description: string
}

interface Props {
  values: EventFormValues
  onChange: (next: EventFormValues) => void
  /** Disable the type toggle (e.g. when editing an existing job). */
  lockType?: boolean
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

const focusBorder = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  e.target.style.borderColor = '#FFB300'
}
const blurBorder = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  e.target.style.borderColor = '#30363D'
}

export default function EventFormFields({ values, onChange, lockType }: Props) {
  const set = <K extends keyof EventFormValues>(key: K, v: EventFormValues[K]) =>
    onChange({ ...values, [key]: v })

  const schedulePreview = values.type === 'cron' ? describeSchedule(values.schedule) : ''

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label style={labelStyle}>Title</label>
        <input
          style={inputStyle}
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          required
          onFocus={focusBorder}
          onBlur={blurBorder}
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
              disabled={lockType}
              onClick={() => set('type', t)}
              className="flex-1 py-2 rounded text-[11px] font-mono uppercase tracking-widest transition-all duration-100"
              style={{
                backgroundColor: values.type === t ? (t === 'cron' ? 'rgba(255,179,0,0.12)' : 'rgba(20,184,166,0.12)') : '#0D1117',
                border: `0.5px solid ${values.type === t ? (t === 'cron' ? '#FFB300' : '#14B8A6') : '#30363D'}`,
                color: values.type === t ? (t === 'cron' ? '#FFB300' : '#14B8A6') : '#8B949E',
                opacity: lockType && values.type !== t ? 0.4 : 1,
                cursor: lockType ? 'not-allowed' : 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Schedule (cron) or datetime (planned) */}
      {values.type === 'cron' ? (
        <div>
          <label style={labelStyle}>Schedule</label>
          <input
            style={{ ...inputStyle, fontFamily: 'var(--font-jetbrains-mono)' }}
            value={values.schedule}
            onChange={(e) => set('schedule', e.target.value)}
            placeholder="0 2 * * *"
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
          <p className="mt-1 text-[10px] font-mono" style={{ color: '#8B949E' }}>
            Formats:&nbsp;<code>0 9 * * *</code>&nbsp;·&nbsp;<code>every 30m</code>&nbsp;·&nbsp;<code>2h</code>&nbsp;·&nbsp;<code>2026-06-01T14:00</code>
          </p>
          {schedulePreview && (
            <p className="mt-1 text-[11px] font-mono" style={{ color: '#14B8A6' }}>
              {schedulePreview}
            </p>
          )}
        </div>
      ) : (
        <div>
          <label style={labelStyle}>Scheduled Date &amp; Time</label>
          <input
            type="datetime-local"
            style={{ ...inputStyle, colorScheme: 'dark' }}
            value={values.scheduledAt}
            onChange={(e) => set('scheduledAt', e.target.value)}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
        </div>
      )}

      {/* Prompt */}
      <div>
        <label style={labelStyle}>
          Prompt {values.type === 'cron' ? <span style={{ color: '#FFB300' }}>(required)</span> : <span>(optional — leave blank for calendar marker)</span>}
        </label>
        <textarea
          style={{ ...inputStyle, minHeight: '90px', resize: 'vertical', lineHeight: '1.5' }}
          value={values.prompt}
          onChange={(e) => set('prompt', e.target.value)}
          placeholder="What should Hermes do when this fires?"
          onFocus={focusBorder}
          onBlur={blurBorder}
        />
      </div>

      {/* Skills */}
      <div>
        <label style={labelStyle}>Skills (optional, comma-separated)</label>
        <input
          style={{ ...inputStyle, fontFamily: 'var(--font-jetbrains-mono)' }}
          value={values.skillsText}
          onChange={(e) => set('skillsText', e.target.value)}
          placeholder="blogwatcher, maps"
          onFocus={focusBorder}
          onBlur={blurBorder}
        />
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>Description (optional)</label>
        <textarea
          style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', lineHeight: '1.5' }}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          onFocus={focusBorder}
          onBlur={blurBorder}
        />
      </div>
    </div>
  )
}

export function parseSkillsText(text: string): string[] {
  return text.split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * Format a Date as `YYYY-MM-DDTHH:MM` in the **local** timezone — that's
 * what `<input type="datetime-local">` expects.  `toISOString()` would
 * shift to UTC and cause the input to display the wrong wall-clock time.
 */
function toDatetimeLocal(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function eventToFormValues(ev: CalendarEvent): EventFormValues {
  return {
    title:       ev.title,
    type:        ev.type,
    schedule:    ev.schedule ?? '',
    scheduledAt: toDatetimeLocal(ev.scheduledAt),
    prompt:      ev.prompt ?? '',
    skillsText:  (ev.skills ?? []).join(', '),
    description: ev.description ?? '',
  }
}

export const emptyFormValues: EventFormValues = {
  title: '',
  type: 'cron',
  schedule: '0 2 * * *',
  scheduledAt: '',
  prompt: '',
  skillsText: '',
  description: '',
}
