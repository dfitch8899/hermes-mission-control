'use client'

import { Pencil, Play, Pause, Trash2 } from 'lucide-react'
import type { CalendarEvent } from '@/types/calendar'

interface Props {
  event: CalendarEvent
  busy?: boolean
  onEdit?:    (evt: CalendarEvent) => void
  onRun?:     (evt: CalendarEvent) => void
  onPause?:   (evt: CalendarEvent) => void
  onResume?:  (evt: CalendarEvent) => void
  onDelete?:  (evt: CalendarEvent) => void
}

const baseBtnStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  border: '0.5px solid rgba(255,255,255,0.08)',
  backgroundColor: 'rgba(255,255,255,0.03)',
  color: '#8B949E',
  transition: 'all 100ms',
}

function IconBtn({
  label, color, onClick, disabled, children,
}: {
  label: string
  color: string
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{ ...baseBtnStyle, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.color = color; e.currentTarget.style.borderColor = color + '50' } }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#8B949E'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
    >
      {children}
    </button>
  )
}

export default function JobActionButtons({ event, busy, onEdit, onRun, onPause, onResume, onDelete }: Props) {
  // Calendar markers are MC-only (no Hermes job).  We mint their ids with
  // a `cal-` prefix; Hermes ids are 12-char hex.  Empty prompt isn't a
  // reliable signal because `hermes cron list` doesn't return prompts —
  // synced Hermes jobs would all incorrectly look like markers otherwise.
  const isMarker = event.eventId.startsWith('cal-')
  const isPaused = event.state === 'paused'

  return (
    <div className="flex items-center gap-1.5">
      {onEdit && (
        <IconBtn label="Edit" color="#FFB300" onClick={() => onEdit(event)} disabled={busy}>
          <Pencil size={12} />
        </IconBtn>
      )}
      {!isMarker && onRun && (
        <IconBtn label="Run now" color="#5df6e0" onClick={() => onRun(event)} disabled={busy}>
          <Play size={12} />
        </IconBtn>
      )}
      {!isMarker && (isPaused
        ? (onResume && (
            <IconBtn label="Resume" color="#5df6e0" onClick={() => onResume(event)} disabled={busy}>
              <Play size={12} />
            </IconBtn>
          ))
        : (onPause && (
            <IconBtn label="Pause" color="#FFB300" onClick={() => onPause(event)} disabled={busy}>
              <Pause size={12} />
            </IconBtn>
          ))
      )}
      {onDelete && (
        <IconBtn label="Delete" color="#ffb4ab" onClick={() => onDelete(event)} disabled={busy}>
          <Trash2 size={12} />
        </IconBtn>
      )}
    </div>
  )
}
