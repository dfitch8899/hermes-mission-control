'use client'

import { useState, useEffect } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import MetricCard from '@/components/overview/MetricCard'
import ActivityFeed from '@/components/overview/ActivityFeed'
import Badge from '@/components/ui/Badge'
import { MOCK_TASKS, MOCK_MEMORIES, MOCK_CALENDAR_EVENTS } from '@/lib/mockData'
import { formatDistanceToNow } from 'date-fns'
import type { Task } from '@/types/task'
import type { Memory } from '@/types/memory'
import type { CalendarEvent } from '@/types/calendar'

function Countdown({ target }: { target: string }) {
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    function update() {
      const diff = new Date(target).getTime() - Date.now()
      if (diff <= 0) { setRemaining('Now'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [target])

  return <>{remaining}</>
}

function UptimeDisplay() {
  const [uptime, setUptime] = useState('')
  const startTime = Date.now() - 86400000 * 3 - 3600000 * 7 // mock 3d 7h uptime

  useEffect(() => {
    function update() {
      const diff = Date.now() - startTime
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setUptime(`${d}d ${h}h ${m}m`)
    }
    update()
    const t = setInterval(update, 60000)
    return () => clearInterval(t)
  }, [])

  return <>{uptime}</>
}

const priorityBadge = {
  critical: 'red' as const,
  high: 'amber' as const,
  medium: 'blue' as const,
  low: 'muted' as const,
}

export default function OverviewPage() {
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS)
  const [memories, setMemories] = useState<Memory[]>(MOCK_MEMORIES)
  const [events, setEvents] = useState<CalendarEvent[]>(MOCK_CALENDAR_EVENTS)

  useEffect(() => {
    // Try to load live data
    fetch('/api/tasks').then(r => r.ok ? r.json() : null).then(d => { if (d?.tasks?.length) setTasks(d.tasks) }).catch(() => {})
    fetch('/api/memories').then(r => r.ok ? r.json() : null).then(d => { if (d?.memories?.length) setMemories(d.memories) }).catch(() => {})
    fetch('/api/calendar').then(r => r.ok ? r.json() : null).then(d => { if (d?.events?.length) setEvents(d.events) }).catch(() => {})
  }, [])

  const inProgressTasks = tasks.filter(t => t.status === 'in_progress')
  const recentTasks = [...tasks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5)
  const recentMemories = [...memories].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 3)
  const upcomingEvents = [...events].sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime()).slice(0, 3)
  const nextEvent = upcomingEvents[0]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopAppBar breadcrumb={['Hermes', 'Overview']} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Page header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface">
              Agent <span style={{ color: '#3cd7ff' }}>Operations</span>
            </h1>
            <p className="text-[11px] font-mono text-outline mt-1 uppercase tracking-widest">
              Hermes Mission Control
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full liquid-glass">
            <span className="w-2 h-2 rounded-full animate-pulse-glow" style={{ backgroundColor: '#5df6e0' }} />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#5df6e0' }}>
              Agent Online
            </span>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Active Tasks"
            value={inProgressTasks.length}
            sub={`${tasks.length} total tasks`}
            accent="cyan"
            live
          />
          <MetricCard
            label="Memories Stored"
            value={memories.length}
            sub={`${memories.filter(m => m.source === 'hermes').length} from Hermes`}
            accent="purple"
          />
          <MetricCard
            label="Next Scheduled Run"
            value={nextEvent ? <Countdown target={nextEvent.nextRun} /> : '—'}
            sub={nextEvent?.title ?? 'No upcoming events'}
            accent="teal"
            live
          />
          <MetricCard
            label="Agent Status"
            value={
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full inline-block animate-live-pulse" style={{ backgroundColor: '#5df6e0' }} />
                ONLINE
              </span>
            }
            sub={<><UptimeDisplay /> uptime</>}
            accent="teal"
            live
          />
        </div>

        {/* Middle row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recent Tasks */}
          <div className="rounded-2xl p-5 glass-card">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-outline">Recent Tasks</span>
              <a
                href="/tasks"
                className="text-[10px] font-mono uppercase tracking-widest transition-colors duration-100"
                style={{ color: '#859398' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#a8e8ff' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#859398' }}
              >
                View all →
              </a>
            </div>
            <div className="space-y-3">
              {recentTasks.map((task, i) => (
                <div
                  key={task.taskId}
                  className="flex items-start gap-3 py-2 animate-slide-in-left"
                  style={{
                    animationDelay: `${i * 60}ms`,
                    borderBottom: i < recentTasks.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{
                      backgroundColor:
                        task.status === 'in_progress' ? '#3cd7ff'
                        : task.status === 'done' ? '#5df6e0'
                        : task.status === 'queued' ? '#b8c4ff'
                        : '#859398',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate text-on-surface">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={priorityBadge[task.priority]}>{task.priority}</Badge>
                      <span className="text-[10px] font-mono text-outline">
                        {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Memories */}
          <div className="rounded-2xl p-5 glass-card">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-outline">Recent Memories</span>
              <a
                href="/memory"
                className="text-[10px] font-mono uppercase tracking-widest transition-colors duration-100"
                style={{ color: '#859398' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#a8e8ff' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#859398' }}
              >
                View all →
              </a>
            </div>
            <div className="space-y-3">
              {recentMemories.map((mem, i) => (
                <div
                  key={mem.memoryId}
                  className="animate-slide-in-left"
                  style={{
                    animationDelay: `${i * 80}ms`,
                    borderBottom: i < recentMemories.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    paddingBottom: i < recentMemories.length - 1 ? '12px' : '0',
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-[12px] font-medium leading-snug text-on-surface">{mem.title}</p>
                    <Badge variant={mem.type === 'context' ? 'cyan' : mem.type === 'skill' ? 'amber' : 'teal'}>
                      {mem.type}
                    </Badge>
                  </div>
                  <p className="text-[11px] line-clamp-2 text-outline">
                    {mem.content.replace(/[#*`>\[\]]/g, '').trim().slice(0, 100)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="rounded-2xl p-5 glass-card">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-outline">Upcoming Events</span>
              <a
                href="/calendar"
                className="text-[10px] font-mono uppercase tracking-widest transition-colors duration-100"
                style={{ color: '#859398' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#a8e8ff' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#859398' }}
              >
                View all →
              </a>
            </div>
            <div className="space-y-3">
              {upcomingEvents.map((evt, i) => (
                <div
                  key={evt.eventId}
                  className="flex items-start gap-3 animate-slide-in-left"
                  style={{
                    animationDelay: `${i * 70}ms`,
                    borderBottom: i < upcomingEvents.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    paddingBottom: i < upcomingEvents.length - 1 ? '12px' : '0',
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: evt.type === 'cron' ? '#a8e8ff' : '#5df6e0' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate text-on-surface">{evt.title}</p>
                    <p className="text-[10px] font-mono mt-0.5 text-outline">
                      <Countdown target={evt.nextRun} />
                    </p>
                    {evt.cronExpression && (
                      <p className="text-[10px] font-mono text-outline">
                        {evt.cronExpression}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="h-64">
          <ActivityFeed />
        </div>
      </div>
    </div>
  )
}
