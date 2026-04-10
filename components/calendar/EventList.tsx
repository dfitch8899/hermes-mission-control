'use client'

import { formatDistanceToNow, format } from 'date-fns'
import type { CalendarEvent } from '@/types/calendar'
import { CheckCircle, XCircle, Loader, Clock } from 'lucide-react'

interface EventListProps {
  events: CalendarEvent[]
  selectedDate: Date
}

function StatusIcon({ status }: { status: CalendarEvent['lastRunStatus'] }) {
  if (!status || status === 'never') return <Clock size={14} className="text-outline" />
  if (status === 'success') return <CheckCircle size={14} style={{ color: '#5df6e0' }} />
  if (status === 'failed') return <XCircle size={14} style={{ color: '#ffb4ab' }} />
  if (status === 'running') return <Loader size={14} style={{ color: '#a8e8ff' }} className="animate-spin" />
  return null
}

function CountdownTimer({ nextRun }: { nextRun: string }) {
  const diff = new Date(nextRun).getTime() - Date.now()
  if (diff <= 0) return <span style={{ color: '#ffb4ab' }}>Overdue</span>
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
    <div className="rounded-2xl glass-card overflow-hidden">
      <div
        className="px-5 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <span className="text-[11px] font-headline font-bold uppercase tracking-widest text-outline">
          {format(selectedDate, 'MMMM d, yyyy')} — {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {dayEvents.length === 0 ? (
        <div className="py-8 text-center text-[12px] font-mono text-outline">
          No events scheduled for this day
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          {dayEvents.map((evt) => (
            <div key={evt.eventId} className="px-5 py-4 flex items-start gap-4">
              {/* Type indicator */}
              <div
                className="w-1 self-stretch rounded-full shrink-0 mt-0.5"
                style={{ backgroundColor: evt.type === 'cron' ? '#a8e8ff' : '#5df6e0', minHeight: '20px' }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-[13px] font-medium text-on-surface">
                    {evt.title}
                  </h4>
                  <div
                    className="shrink-0 text-[9px] font-mono uppercase px-1.5 py-0.5 rounded tracking-widest"
                    style={{
                      color: evt.type === 'cron' ? '#a8e8ff' : '#5df6e0',
                      backgroundColor: evt.type === 'cron' ? 'rgba(168,232,255,0.08)' : 'rgba(93,246,224,0.08)',
                      border: `1px solid ${evt.type === 'cron' ? 'rgba(168,232,255,0.2)' : 'rgba(93,246,224,0.2)'}`,
                    }}
                  >
                    {evt.type}
                  </div>
                </div>

                {evt.cronExpression && (
                  <div className="mb-1">
                    <code className="text-[11px] font-mono text-outline">
                      {evt.cronExpression}
                    </code>
                    {evt.cronHumanReadable && (
                      <span className="text-[11px] ml-2 text-outline">
                        — {evt.cronHumanReadable}
                      </span>
                    )}
                  </div>
                )}

                {evt.description && (
                  <p className="text-[11px] mb-2 text-outline">
                    {evt.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-[10px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={evt.lastRunStatus} />
                    <span className="text-outline">
                      {evt.lastRun
                        ? `Last: ${formatDistanceToNow(new Date(evt.lastRun), { addSuffix: true })}`
                        : 'Never run'}
                    </span>
                  </div>
                  <div className="text-outline">
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
