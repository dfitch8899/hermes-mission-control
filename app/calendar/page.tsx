'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import TopAppBar from '@/components/layout/TopAppBar'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import EventList from '@/components/calendar/EventList'
import AddEventForm from '@/components/calendar/AddEventForm'
import EditEventModal from '@/components/calendar/EditEventModal'
import JobActionButtons from '@/components/calendar/JobActionButtons'
import type { CalendarEvent } from '@/types/calendar'
import { Plus, RefreshCw } from 'lucide-react'

export default function CalendarPage() {
  const [events, setEvents]               = useState<CalendarEvent[]>([])
  const [selectedDate, setSelectedDate]   = useState(new Date())
  const [showAddForm, setShowAddForm]     = useState(false)
  const [editing, setEditing]             = useState<CalendarEvent | null>(null)
  const [busyId, setBusyId]               = useState<string | null>(null)
  const [syncing, setSyncing]             = useState(false)
  const [syncedAt, setSyncedAt]           = useState<string | null>(null)
  const [pageError, setPageError]         = useState<string | null>(null)

  const cronCount    = useMemo(() => events.filter(e => e.type === 'cron').length, [events])
  const plannedCount = useMemo(() => events.filter(e => e.type === 'planned').length, [events])

  const syncInFlight = useRef(false)
  const sync = useCallback(async () => {
    if (syncInFlight.current) return
    syncInFlight.current = true
    setSyncing(true)
    setPageError(null)
    try {
      const r = await fetch('/api/calendar/sync', { method: 'POST' })
      if (r.ok) {
        const d = await r.json()
        setEvents(Array.isArray(d?.events) ? (d.events as CalendarEvent[]) : [])
        if (d?.syncedAt) setSyncedAt(d.syncedAt as string)
      } else {
        const e = await r.json().catch(() => ({}))
        setPageError(e?.error ?? `Sync failed (HTTP ${r.status})`)
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncing(false)
      syncInFlight.current = false
    }
  }, [])

  // Sync on mount AND when the tab becomes visible. `focus` would fire alongside
  // `visibilitychange` on tab return causing a duplicate sync; the in-flight ref
  // above prevents that, but listening to one event is simpler.
  useEffect(() => {
    void sync()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [sync])

  // ── Mutations ──────────────────────────────────────────────────────────

  type AddPayload = Partial<CalendarEvent> & { skills?: string[] }

  const handleAddEvent = async (event: AddPayload) => {
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(e?.error ?? `HTTP ${res.status}`)
    }
    const data = await res.json()
    if (data?.event) {
      setEvents(prev => [...prev.filter(p => p.eventId !== data.event.eventId), data.event as CalendarEvent])
    }
    void sync()
  }

  const handleEditSave = async (eventId: string, updates: AddPayload) => {
    const res = await fetch(`/api/calendar/${encodeURIComponent(eventId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(e?.error ?? `HTTP ${res.status}`)
    }
    const data = await res.json()
    if (data?.event) {
      setEvents(prev => prev.map(p => p.eventId === eventId ? { ...p, ...(data.event as CalendarEvent) } : p))
    }
    void sync()
  }

  const callAction = async (evt: CalendarEvent, path: string, optimistic?: Partial<CalendarEvent>) => {
    setBusyId(evt.eventId)
    setPageError(null)
    try {
      const res = await fetch(`/api/calendar/${encodeURIComponent(evt.eventId)}${path}`, { method: 'POST' })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e?.error ?? `HTTP ${res.status}`)
      }
      if (optimistic) {
        setEvents(prev => prev.map(p => p.eventId === evt.eventId ? { ...p, ...optimistic } : p))
      }
      // Re-sync from Hermes so all views (grid, day list, full list) stay in lockstep.
      void sync()
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleRun    = (evt: CalendarEvent) => callAction(evt, '/run')
  const handlePause  = (evt: CalendarEvent) => callAction(evt, '/pause',  { state: 'paused' })
  const handleResume = (evt: CalendarEvent) => callAction(evt, '/resume', { state: 'scheduled' })

  const handleDelete = async (evt: CalendarEvent) => {
    if (!confirm(`Delete "${evt.title}"?`)) return
    setBusyId(evt.eventId)
    setPageError(null)
    try {
      const res = await fetch(`/api/calendar/${encodeURIComponent(evt.eventId)}`, { method: 'DELETE' })
      const rawText = await res.text()
      let body: Record<string, unknown> = {}
      try { body = JSON.parse(rawText) } catch { body = { _raw: rawText } }
      console.log(`[calendar.delete] status=${res.status} body=${JSON.stringify(body, null, 2)}`)
      if (!res.ok) {
        throw new Error(
          // `??` lets empty strings through; `||` falls back to '(empty body)'
          // when the server returned { error: "" } or omitted the key entirely.
          `[${res.status}] ${body?.error || '(empty body)'}` +
          (body?._path ? `  path=${body._path}` : '') +
          (body?._stack ? `\n${body._stack}` : ''),
        )
      }
      // Optimistic drop — server already guarantees the row is gone OR
      // tombstoned-and-paused, so it's safe to hide everywhere immediately.
      setEvents(prev => prev.filter(p => p.eventId !== evt.eventId))
      void sync()

      if (body?._tombstoned) {
        console.warn('[calendar.delete] Hermes refused to remove; paused + tombstoned.', body)
        if (body?._pausedFallback) {
          setPageError(
            `"${evt.title}": Hermes wouldn't fully delete the job, but it has been paused so it won't fire. ` +
            `Sync will keep retrying the remove in the background.`,
          )
        }
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'url(/bg-calendar.jpg)', backgroundSize: 'cover', backgroundPosition: 'center 20%', opacity: 0.12, zIndex: 0 }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 20%, #0d1323 72%)', zIndex: 1 }} />
      <TopAppBar breadcrumb={['Hermes', 'Calendar']} />

      {/* Subheader */}
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(13,19,35,0.5)', position: 'relative', zIndex: 2 }}
      >
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-mono uppercase tracking-widest text-outline">
            {cronCount} cron jobs
          </span>
          <span className="text-[11px] font-mono text-outline">·</span>
          <span className="text-[11px] font-mono" style={{ color: '#5df6e0' }}>
            {plannedCount} planned
          </span>
          {syncedAt && (
            <>
              <span className="text-[11px] font-mono text-outline">·</span>
              <span className="text-[10px] font-mono text-outline">
                synced {formatDistanceToNow(new Date(syncedAt), { addSuffix: true })}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={sync}
            disabled={syncing}
            title="Sync with Hermes"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-widest"
            style={{
              backgroundColor: 'rgba(168,232,255,0.06)',
              color: '#a8e8ff',
              border: '1px solid rgba(168,232,255,0.15)',
              opacity: syncing ? 0.5 : 1,
              cursor: syncing ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-widest"
            style={{
              backgroundColor: 'rgba(93,246,224,0.08)',
              color: '#5df6e0',
              border: '1px solid rgba(93,246,224,0.2)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(93,246,224,0.14)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(93,246,224,0.08)' }}
          >
            <Plus size={13} />
            Add Event
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ position: 'relative', zIndex: 2 }}>
        {pageError && (
          <div
            className="rounded px-4 py-2 text-[11px] font-mono"
            style={{ backgroundColor: 'rgba(255,180,171,0.08)', border: '1px solid rgba(255,180,171,0.25)', color: '#ffb4ab' }}
          >
            {pageError}
          </div>
        )}

        <CalendarGrid
          events={events}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
        <EventList
          events={events}
          selectedDate={selectedDate}
          onEdit={setEditing}
          onRun={handleRun}
          onPause={handlePause}
          onResume={handleResume}
          onDelete={handleDelete}
          busyId={busyId}
        />

        {/* All events list */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-[11px] font-headline font-bold uppercase tracking-widest text-outline">
              All Scheduled Jobs
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            {events.length === 0 && (
              <div className="px-5 py-8 text-center text-[12px] font-mono text-outline">
                No scheduled jobs.
              </div>
            )}
            {events.map((evt) => (
              <div key={evt.eventId} className="px-5 py-3 flex items-center gap-4">
                <div
                  className="w-1 h-8 rounded-full shrink-0"
                  style={{ backgroundColor: evt.type === 'cron' ? '#3cd7ff' : '#5df6e0' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-on-surface">{evt.title}</span>
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-widest"
                      style={{
                        color: evt.type === 'cron' ? '#a8e8ff' : '#5df6e0',
                        backgroundColor: evt.type === 'cron' ? 'rgba(168,232,255,0.08)' : 'rgba(93,246,224,0.08)',
                      }}
                    >
                      {evt.type}
                    </span>
                    {evt.state === 'paused' && (
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-widest"
                        style={{ color: '#FFB300', backgroundColor: 'rgba(255,179,0,0.08)' }}
                      >
                        paused
                      </span>
                    )}
                  </div>
                  {(evt.scheduleDisplay || evt.schedule) && (
                    <code className="text-[11px] font-mono text-outline">
                      {evt.scheduleDisplay || evt.schedule}
                    </code>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded mb-1"
                    style={{
                      color: evt.lastRunStatus === 'success' ? '#5df6e0' : evt.lastRunStatus === 'failed' ? '#ffb4ab' : '#859398',
                      backgroundColor: evt.lastRunStatus === 'success' ? 'rgba(93,246,224,0.08)' : evt.lastRunStatus === 'failed' ? 'rgba(255,180,171,0.08)' : 'rgba(133,147,152,0.08)',
                    }}
                  >
                    {evt.lastRunStatus || 'never'}
                  </div>
                  <div className="text-[10px] font-mono text-outline">
                    {evt.nextRun ? formatDistanceToNow(new Date(evt.nextRun), { addSuffix: true }) : '—'}
                  </div>
                </div>
                <JobActionButtons
                  event={evt}
                  busy={busyId === evt.eventId}
                  onEdit={setEditing}
                  onRun={handleRun}
                  onPause={handlePause}
                  onResume={handleResume}
                  onDelete={handleDelete}
                />
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

      {editing && (
        <EditEventModal
          event={editing}
          onClose={() => setEditing(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  )
}
