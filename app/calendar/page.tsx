'use client'

import { useState, useEffect } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import EventList from '@/components/calendar/EventList'
import AddEventForm from '@/components/calendar/AddEventForm'
import { MOCK_CALENDAR_EVENTS } from '@/lib/mockData'
import type { CalendarEvent } from '@/types/calendar'
import { Plus } from 'lucide-react'

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>(MOCK_CALENDAR_EVENTS)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [showAddForm, setShowAddForm] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/calendar')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.events?.length) setEvents(d.events)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleAddEvent = async (event: Partial<CalendarEvent>) => {
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.event) setEvents(prev => [...prev, data.event])
      else {
        // Optimistic with mock ID
        const newEvt: CalendarEvent = {
          ...event,
          eventId: `EVT-${Date.now()}`,
          scheduledAt: event.scheduledAt || new Date().toISOString(),
          nextRun: event.nextRun || new Date().toISOString(),
          createdBy: 'user',
          title: event.title || '',
          type: event.type || 'planned',
        }
        setEvents(prev => [...prev, newEvt])
      }
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopAppBar breadcrumb={['Hermes', 'Calendar']} />

      {/* Subheader */}
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ borderBottom: '0.5px solid #30363D', backgroundColor: '#161B22' }}
      >
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color: '#8B949E' }}>
            {events.filter(e => e.type === 'cron').length} cron jobs
          </span>
          <span className="text-[11px] font-mono" style={{ color: '#484F58' }}>·</span>
          <span className="text-[11px] font-mono" style={{ color: '#14B8A6' }}>
            {events.filter(e => e.type === 'planned').length} planned
          </span>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-widest transition-all duration-100"
          style={{
            backgroundColor: 'rgba(20,184,166,0.1)',
            color: '#14B8A6',
            border: '0.5px solid rgba(20,184,166,0.25)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(20,184,166,0.15)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(20,184,166,0.1)' }}
        >
          <Plus size={13} />
          Add Event
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <CalendarGrid
          events={events}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
        <EventList
          events={events}
          selectedDate={selectedDate}
        />

        {/* All events list */}
        <div
          className="rounded overflow-hidden"
          style={{ backgroundColor: '#161B22', border: '0.5px solid #30363D' }}
        >
          <div className="px-5 py-3" style={{ borderBottom: '0.5px solid #30363D' }}>
            <span className="text-[11px] font-headline font-bold uppercase tracking-widest" style={{ color: '#8B949E' }}>
              All Scheduled Jobs
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: '#21262D' }}>
            {events.map((evt) => (
              <div key={evt.eventId} className="px-5 py-3 flex items-center gap-4">
                <div
                  className="w-1 h-8 rounded-full shrink-0"
                  style={{ backgroundColor: evt.type === 'cron' ? '#FFB300' : '#14B8A6' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium" style={{ color: '#E6EDF3' }}>{evt.title}</span>
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-widest"
                      style={{
                        color: evt.type === 'cron' ? '#FFB300' : '#14B8A6',
                        backgroundColor: evt.type === 'cron' ? 'rgba(255,179,0,0.08)' : 'rgba(20,184,166,0.08)',
                      }}
                    >
                      {evt.type}
                    </span>
                  </div>
                  {evt.cronExpression && (
                    <code className="text-[11px] font-mono" style={{ color: '#484F58' }}>
                      {evt.cronExpression} — {evt.cronHumanReadable}
                    </code>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded mb-1"
                    style={{
                      color: evt.lastRunStatus === 'success' ? '#3FB950' : evt.lastRunStatus === 'failed' ? '#F85149' : '#8B949E',
                      backgroundColor: evt.lastRunStatus === 'success' ? 'rgba(63,185,80,0.08)' : evt.lastRunStatus === 'failed' ? 'rgba(248,81,73,0.08)' : 'rgba(139,148,158,0.08)',
                    }}
                  >
                    {evt.lastRunStatus || 'never'}
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: '#484F58' }}>
                    {evt.ecsTaskDefinition || 'manual'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showAddForm && (
        <AddEventForm
          onClose={() => setShowAddForm(false)}
          onAdd={handleAddEvent}
        />
      )}
    </div>
  )
}
