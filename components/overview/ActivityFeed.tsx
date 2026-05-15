'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  parseActivity,
  severityStyle,
  type ActivityEvent,
  type LogLine,
} from './activityParser'

function parseRawLineColor(msg: string): { color: string; glow: string } {
  if (msg.includes('[ERROR]') || msg.includes('ERROR')) return severityStyle('error')
  if (msg.includes('[WARN]')) return severityStyle('warn')
  if (msg.includes('[OK]') || msg.includes('[SUCCESS]')) return severityStyle('success')
  if (msg.includes('[INFO]')) return severityStyle('info')
  if (msg.includes('[HERMES]') || msg.includes('HERMES >')) return { color: '#3cd7ff', glow: 'rgba(60,215,255,0.1)' }
  return severityStyle('muted')
}

export default function ActivityFeed() {
  const [logs, setLogs] = useState<LogLine[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [fetching, setFetching] = useState(false)
  const [view, setView] = useState<'grouped' | 'raw'>('grouped')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)

  async function fetchLogs() {
    setFetching(true)
    try {
      const res = await fetch('/api/ecs/logs?lines=50')
      if (res.ok) {
        const data = await res.json()
        if (data.logs && Array.isArray(data.logs)) setLogs(data.logs)
      }
    } catch { /* silently fail */ }
    finally {
      setFetching(false)
      setLastUpdated(new Date())
    }
  }

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 10000)
    return () => clearInterval(interval)
  }, [])

  const events = useMemo<ActivityEvent[]>(() => parseActivity(logs), [logs])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, view])

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full rounded-2xl glass-card-glow overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: fetching ? '#3cd7ff' : '#5df6e0',
              boxShadow: `0 0 8px ${fetching ? 'rgba(60,215,255,0.5)' : 'rgba(93,246,224,0.5)'}`,
            }}
          />
          <span className="text-[10px] uppercase tracking-[0.15em] font-mono text-outline">
            Activity Feed
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div
            className="flex items-center rounded-md overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {(['grouped', 'raw'] as const).map(v => {
              const active = view === v
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="text-[9px] uppercase tracking-[0.15em] font-mono px-2 py-1 transition-colors"
                  style={{
                    color: active ? '#3cd7ff' : 'rgba(133,147,152,0.7)',
                    backgroundColor: active ? 'rgba(60,215,255,0.08)' : 'transparent',
                  }}
                  aria-pressed={active}
                >
                  {v}
                </button>
              )
            })}
          </div>
          {lastUpdated && (
            <span className="text-[10px] font-mono text-outline opacity-60">
              {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-0.5 font-mono"
        style={{ background: 'rgba(8, 14, 29, 0.4)' }}
      >
        {logs.length === 0 ? (
          <div className="text-[11px] py-4 text-center text-outline opacity-50">
            Waiting for log data...
          </div>
        ) : view === 'grouped' ? (
          events.map((evt, i) => {
            const isNewest = i === events.length - 1
            const { color, glow } = severityStyle(evt.severity)
            const ts = new Date(evt.timestamp)
            const timeStr = ts.toLocaleTimeString('en-US', { hour12: false })
            const isExpandable = !!evt.detail && evt.detail.length > 0
            const isOpen = expanded.has(evt.id)
            const dimmed = evt.kind === 'skill-sync' || evt.kind === 'worker-init'
            return (
              <div key={evt.id}>
                <div
                  className={`flex items-start gap-2 text-[11px] leading-relaxed py-1 px-1.5 rounded ${isExpandable ? 'cursor-pointer' : ''}`}
                  style={{
                    background: isNewest ? 'rgba(60, 215, 255, 0.04)' : glow,
                    borderLeft: isNewest ? '2px solid #3cd7ff' : '2px solid transparent',
                    opacity: dimmed && !isNewest && !isOpen ? 0.7 : 1,
                  }}
                  onClick={() => isExpandable && toggleExpanded(evt.id)}
                >
                  <span className="text-outline opacity-50 shrink-0 tabular-nums">[{timeStr}]</span>
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-[6px] shrink-0"
                    style={{
                      backgroundColor: color,
                      boxShadow: evt.severity === 'error' ? `0 0 6px ${color}aa` : 'none',
                    }}
                  />
                  <span className="flex-1 break-words" style={{ color }}>{evt.summary}</span>
                  {evt.count && evt.count > 1 && (
                    <span
                      className="shrink-0 inline-flex items-center px-1.5 rounded-md text-[9px] uppercase tracking-widest font-mono"
                      style={{
                        backgroundColor: 'rgba(133,147,152,0.1)',
                        color: '#859398',
                        border: '1px solid rgba(133,147,152,0.2)',
                      }}
                    >
                      +{evt.count}
                    </span>
                  )}
                  {isExpandable && (
                    <span className="text-outline opacity-50 shrink-0 ml-1 select-none">
                      {isOpen ? '▾' : '▸'}
                    </span>
                  )}
                </div>
                {isExpandable && isOpen && evt.detail && (
                  <div
                    className="mt-1 mb-1 ml-8 pl-3 py-1.5 rounded text-[10.5px] leading-relaxed whitespace-pre-wrap break-words"
                    style={{
                      borderLeft: '1px solid rgba(255,255,255,0.08)',
                      color: '#78868b',
                      background: 'rgba(8,14,29,0.3)',
                    }}
                  >
                    {evt.detail.map((d, di) => (
                      <div key={di}>{d}</div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        ) : (
          logs.map((line, i) => {
            const isNewest = i === logs.length - 1
            const { color, glow } = parseRawLineColor(line.message)
            const ts = new Date(line.timestamp)
            const timeStr = ts.toLocaleTimeString('en-US', { hour12: false })
            return (
              <div
                key={`${line.timestamp}-${i}`}
                className="flex gap-2 text-[11px] leading-relaxed py-0.5 px-1 rounded"
                style={{
                  background: isNewest ? 'rgba(60, 215, 255, 0.04)' : glow,
                  borderLeft: isNewest ? '2px solid #3cd7ff' : '2px solid transparent',
                }}
              >
                <span className="text-outline opacity-50 shrink-0 tabular-nums">[{timeStr}]</span>
                <span className="break-words" style={{ color }}>{line.message}</span>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
