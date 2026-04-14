'use client'

import { useState, useEffect, useMemo } from 'react'
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
  const startTime = Date.now() - 86400000 * 3 - 3600000 * 7

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
    fetch('/api/tasks').then(r => r.ok ? r.json() : null).then(d => { if (d?.tasks?.length) setTasks(d.tasks) }).catch(() => {})
    fetch('/api/memories').then(r => r.ok ? r.json() : null).then(d => { if (d?.memories?.length) setMemories(d.memories) }).catch(() => {})
    fetch('/api/calendar').then(r => r.ok ? r.json() : null).then(d => { if (d?.events?.length) setEvents(d.events) }).catch(() => {})
  }, [])

  const inProgressTasks = useMemo(() => tasks.filter(t => t.status === 'in_progress'), [tasks])
  const completedTasks = useMemo(() => tasks.filter(t => t.status === 'done'), [tasks])
  const recentTasks = useMemo(() => [...tasks].sort((a, b) => {
    const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    return diff !== 0 ? diff : a.taskId.localeCompare(b.taskId)
  }).slice(0, 5), [tasks])
  const recentMemories = useMemo(() => [...memories].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 3), [memories])
  const upcomingEvents = useMemo(() => [...events].sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime()).slice(0, 3), [events])
  const nextEvent = upcomingEvents[0]

  const taskCompletionRate = useMemo(() => tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0, [tasks, completedTasks])
  const memoryUtilization = useMemo(() => Math.min(Math.round((memories.length / 10) * 100), 100), [memories])

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Background image — higher opacity for atmosphere */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'url(/bg-overview.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 30%',
          opacity: 0.18,
          zIndex: 0,
        }}
      />
      {/* Gradient overlay to blend */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, transparent 25%, #0d1323 75%)',
          zIndex: 1,
        }}
      />

      {/* Ambient orbs for depth — static radial gradients, no blur filter */}
      <div
        className="ambient-orb"
        style={{ width: 400, height: 400, top: '5%', left: '10%', '--orb-color': 'rgba(60, 215, 255, 0.03)', zIndex: 1 } as React.CSSProperties}
      />
      <div
        className="ambient-orb"
        style={{ width: 300, height: 300, bottom: '10%', right: '15%', '--orb-color': 'rgba(93, 246, 224, 0.025)', zIndex: 1 } as React.CSSProperties}
      />

      <TopAppBar breadcrumb={['Hermes', 'Overview']} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 scan-line" style={{ position: 'relative', zIndex: 2 }} suppressHydrationWarning>
        {/* Hero header */}
        <div className="flex items-end justify-between animate-fade-in-up">
          <div>
            <h1 className="font-headline text-4xl font-bold tracking-tight text-on-surface">
              Agent <span className="text-glow-cyan" style={{ color: '#3cd7ff' }}>Operations</span>
            </h1>
            <p className="text-[11px] font-mono text-outline mt-1.5 uppercase tracking-[0.2em]">
              Hermes Mission Control
            </p>
          </div>
          <div
            className="flex items-center gap-2.5 px-4 py-2 rounded-full animate-breathe-glow"
            style={{
              background: 'rgba(93, 246, 224, 0.06)',
              border: '1px solid rgba(93, 246, 224, 0.15)',
            }}
          >
            <span className="w-2 h-2 rounded-full animate-live-pulse" style={{ backgroundColor: '#5df6e0' }} />
            <span className="text-[10px] font-mono uppercase tracking-widest font-medium" style={{ color: '#5df6e0' }}>
              Agent Online
            </span>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stagger-1">
            <MetricCard
              label="Active Tasks"
              value={inProgressTasks.length}
              sub={`${tasks.length} total tasks`}
              accent="cyan"
              live
              progress={taskCompletionRate}
            />
          </div>
          <div className="stagger-2">
            <MetricCard
              label="Memories Stored"
              value={memories.length}
              sub={`${memories.filter(m => m.source === 'hermes').length} from Hermes`}
              accent="purple"
              progress={memoryUtilization}
            />
          </div>
          <div className="stagger-3">
            <MetricCard
              label="Next Scheduled Run"
              value={nextEvent ? <Countdown target={nextEvent.nextRun} /> : '\u2014'}
              sub={nextEvent?.title ?? 'No upcoming events'}
              accent="teal"
              live
            />
          </div>
          <div className="stagger-4">
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
        </div>

        {/* Middle row — 3 column info panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recent Tasks */}
          <div className="rounded-2xl p-5 glass-card animate-fade-in-up stagger-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-outline">Recent Tasks</span>
              <a
                href="/tasks"
                className="text-[10px] font-mono uppercase tracking-widest transition-colors duration-200"
                style={{ color: '#859398' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#3cd7ff' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#859398' }}
              >
                View all &rarr;
              </a>
            </div>
            <div className="space-y-3">
              {recentTasks.map((task, i) => (
                <div
                  key={task.taskId}
                  className="flex items-start gap-3 py-2 animate-slide-in-left"
                  style={{
                    animationDelay: `${i * 60}ms`,
                    borderBottom: i < recentTasks.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
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
                      boxShadow: task.status === 'in_progress'
                        ? '0 0 8px rgba(60, 215, 255, 0.5)'
                        : 'none',
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
          <div className="rounded-2xl p-5 glass-card animate-fade-in-up stagger-6">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-outline">Recent Memories</span>
              <a
                href="/memory"
                className="text-[10px] font-mono uppercase tracking-widest transition-colors duration-200"
                style={{ color: '#859398' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#3cd7ff' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#859398' }}
              >
                View all &rarr;
              </a>
            </div>
            <div className="space-y-3">
              {recentMemories.map((mem, i) => (
                <div
                  key={mem.memoryId}
                  className="animate-slide-in-left"
                  style={{
                    animationDelay: `${i * 80}ms`,
                    borderBottom: i < recentMemories.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
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
          <div className="rounded-2xl p-5 glass-card animate-fade-in-up stagger-7">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-outline">Upcoming Events</span>
              <a
                href="/calendar"
                className="text-[10px] font-mono uppercase tracking-widest transition-colors duration-200"
                style={{ color: '#859398' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#3cd7ff' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#859398' }}
              >
                View all &rarr;
              </a>
            </div>
            <div className="space-y-3">
              {upcomingEvents.map((evt, i) => (
                <div
                  key={evt.eventId}
                  className="flex items-start gap-3 animate-slide-in-left"
                  style={{
                    animationDelay: `${i * 70}ms`,
                    borderBottom: i < upcomingEvents.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    paddingBottom: i < upcomingEvents.length - 1 ? '12px' : '0',
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{
                      backgroundColor: evt.type === 'cron' ? '#3cd7ff' : '#5df6e0',
                      boxShadow: `0 0 8px ${evt.type === 'cron' ? 'rgba(60,215,255,0.4)' : 'rgba(93,246,224,0.4)'}`,
                    }}
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
        <div className="h-64 animate-fade-in-up stagger-8">
          <ActivityFeed />
        </div>
      </div>
    </div>
  )
}
