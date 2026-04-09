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
    <div
      className="rounded overflow-hidden"
      style={{ backgroundColor: '#161B22', border: '0.5px solid #30363D' }}
    >
      {/* Month nav */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: '0.5px solid #30363D' }}
      >
        <button
          onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1))}
          className="w-7 h-7 flex items-center justify-center rounded transition-colors duration-100"
          style={{ color: '#8B949E' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-[13px] font-headline font-bold uppercase tracking-widest" style={{ color: '#E6EDF3' }}>
          {format(viewDate, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1))}
          className="w-7 h-7 flex items-center justify-center rounded transition-colors duration-100"
          style={{ color: '#8B949E' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7">
        {DAYS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[9px] font-mono uppercase tracking-widest"
            style={{ color: '#484F58', borderBottom: '0.5px solid #30363D' }}
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
                border: '0.5px solid #21262D',
                opacity: inMonth ? 1 : 0.3,
                cursor: inMonth ? 'pointer' : 'default',
                backgroundColor: selected
                  ? 'rgba(255,179,0,0.07)'
                  : today
                  ? 'rgba(56,139,253,0.04)'
                  : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (inMonth && !selected) {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'
                }
              }}
              onMouseLeave={(e) => {
                if (inMonth && !selected) {
                  e.currentTarget.style.backgroundColor = today ? 'rgba(56,139,253,0.04)' : 'transparent'
                }
              }}
            >
              <span
                className={`text-[11px] font-mono inline-flex w-5 h-5 items-center justify-center rounded-full`}
                style={{
                  color: today ? '#388BFD' : selected ? '#FFB300' : inMonth ? '#8B949E' : '#484F58',
                  backgroundColor: today ? 'rgba(56,139,253,0.15)' : 'transparent',
                  fontWeight: today || selected ? 600 : 400,
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
                      style={{ backgroundColor: evt.type === 'cron' ? '#FFB300' : '#14B8A6' }}
                      title={evt.title}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[8px] font-mono" style={{ color: '#484F58' }}>
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
