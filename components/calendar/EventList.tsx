'use client'

import { formatDistanceToNow, format } from 'date-fns'
import type { CalendarEvent } from '@/types/calendar'
import { CheckCircle, XCircle, Loader, Clock } from 'lucide-react'

interface EventListProps {
  events: CalendarEvent[]
  selectedDate: Date
}

function StatusIcon({ status }: { status: CalendarEvent['lastRunStatus'] }) {
  if (!status || status === 'never') return <Clock size={14} style={{ color: '#484F58' }} />
  if (status === 'success') return <CheckCircle size={14} style={{ color: '#3FB950' }} />
  if (status === 'failed') return <XCircle size={14} style={{ color: '#F85149' }} />
  if (status === 'running') return <Loader size={14} style={{ color: '#FFB300' }} className="animate-spin" />
  return null
}

function CountdownTimer({ nextRun }: { nextRun: string }) {
  const diff = new Date(nextRun).getTime() - Date.now()
  if (diff <= 0) return <span style={{ color: '#F85149' }}>Overdue</span>
  return <span>{formatDistanceToNow(new Date(nextRun))}</span>
}

export default function EventList({ events, selectedDate }: EventListProps) {
  const dayEvents = events.filter((e) => {
    const d = new Date(e.type === 'cron' ? e.nextRun : e.scheduledAt)
    return (
      d.getFullYear() === selectedDate.getFullYear() &&
      d.getMonth() === selectedDate.getMonth() &&
      d.getDate() === selectedDate.getDate()
    )
  })

  return (
    <div
      className="rounded overflow-hidden"
      style={{ backgroundColor: '#161B22', border: '0.5px solid #30363D' }}
    >
      <div
        className="px-5 py-3"
        style={{ borderBottom: '0.5px solid #30363D' }}
      >
        <span className="text-[11px] font-headline font-bold uppercase tracking-widest" style={{ color: '#8B949E' }}>
          {format(selectedDate, 'MMMM d, yyyy')} — {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {dayEvents.length === 0 ? (
        <div className="py-8 text-center text-[12px] font-mono" style={{ color: '#484F58' }}>
          No events scheduled for this day
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: '#21262D' }}>
          {dayEvents.map((evt) => (
            <div key={evt.eventId} className="px-5 py-4 flex items-start gap-4">
              {/* Type indicator */}
              <div
                className="w-1 self-stretch rounded-full shrink-0 mt-0.5"
                style={{ backgroundColor: evt.type === 'cron' ? '#FFB300' : '#14B8A6', minHeight: '20px' }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-[13px] font-medium" style={{ color: '#E6EDF3' }}>
                    {evt.title}
                  </h4>
                  <div
                    className="shrink-0 text-[9px] font-mono uppercase px-1.5 py-0.5 rounded tracking-widest"
                    style={{
                      color: evt.type === 'cron' ? '#FFB300' : '#14B8A6',
                      backgroundColor: evt.type === 'cron' ? 'rgba(255,179,0,0.1)' : 'rgba(20,184,166,0.1)',
                      border: `0.5px solid ${evt.type === 'cron' ? 'rgba(255,179,0,0.2)' : 'rgba(20,184,166,0.2)'}`,
                    }}
                  >
                    {evt.type}
                  </div>
                </div>

                {evt.cronExpression && (
                  <div className="mb-1">
                    <code
                      className="text-[11px] font-mono"
                      style={{ color: '#8B949E' }}
                    >
                      {evt.cronExpression}
                    </code>
                    {evt.cronHumanReadable && (
                      <span className="text-[11px] ml-2" style={{ color: '#484F58' }}>
                        — {evt.cronHumanReadable}
                      </span>
                    )}
                  </div>
                )}

                {evt.description && (
                  <p className="text-[11px] mb-2" style={{ color: '#8B949E' }}>
                    {evt.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-[10px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={evt.lastRunStatus} />
                    <span style={{ color: '#484F58' }}>
                      {evt.lastRun
                        ? `Last: ${formatDistanceToNow(new Date(evt.lastRun), { addSuffix: true })}`
                        : 'Never run'}
                    </span>
                  </div>
                  <div style={{ color: '#484F58' }}>
                    Next: <CountdownTimer nextRun={evt.nextRun} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
