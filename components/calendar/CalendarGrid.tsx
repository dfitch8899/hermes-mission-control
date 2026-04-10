'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CalendarEvent } from '@/types/calendar'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, isSameDay } from 'date-fns'

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

interface CalendarGridProps {
  events: CalendarEvent[]
  selectedDate: Date
  onSelectDate: (date: Date) => void
}

export default function CalendarGrid({ events, selectedDate, onSelectDate }: CalendarGridProps) {
  const [viewDate, setViewDate] = useState(new Date())

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const getEventsForDay = (day: Date) => {
    return events.filter((e) => {
      const d = new Date(e.type === 'cron' ? e.nextRun : e.scheduledAt)
      return isSameDay(d, day)
    })
  }

  return (
    <div className="rounded-2xl glass-card overflow-hidden">
      {/* Month nav */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <button
          onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1))}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-100 text-outline"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-[13px] font-headline font-bold uppercase tracking-widest text-on-surface">
          {format(viewDate, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1))}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-100 text-outline"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7">
        {DAYS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[9px] font-mono uppercase tracking-widest text-outline"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayEvents = getEventsForDay(day)
          const inMonth = isSameMonth(day, viewDate)
          const today = isToday(day)
          const selected = isSameDay(day, selectedDate)

          return (
            <div
              key={day.toISOString()}
              onClick={() => inMonth && onSelectDate(day)}
              className="min-h-[64px] p-2 transition-colors duration-100"
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                opacity: inMonth ? 1 : 0.25,
                cursor: inMonth ? 'pointer' : 'default',
                background: selected
                  ? 'rgba(60,215,255,0.1)'
                  : today
                  ? 'rgba(93,246,224,0.05)'
                  : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (inMonth && !selected) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                }
              }}
              onMouseLeave={(e) => {
                if (inMonth && !selected) {
                  e.currentTarget.style.background = today ? 'rgba(93,246,224,0.05)' : 'transparent'
                }
              }}
            >
              <span
                className="text-[13px] font-headline font-medium inline-flex w-5 h-5 items-center justify-center rounded-full"
                style={{
                  color: selected ? '#3cd7ff' : today ? '#5df6e0' : '#dde2f9',
                  backgroundColor: today && !selected ? 'rgba(93,246,224,0.12)' : 'transparent',
                  fontWeight: today || selected ? 700 : 400,
                }}
              >
                {format(day, 'd')}
              </span>
              {/* Event dots */}
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 mt-1 flex-wrap">
                  {dayEvents.slice(0, 3).map((evt) => (
                    <div
                      key={evt.eventId}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: evt.type === 'cron' ? '#a8e8ff' : '#5df6e0',
                        boxShadow: `0 0 4px ${evt.type === 'cron' ? '#a8e8ff' : '#5df6e0'}80`,
                      }}
                      title={evt.title}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[8px] font-mono text-outline">
                      +{dayEvents.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
