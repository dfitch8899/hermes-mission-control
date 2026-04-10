'use client'

import { useEffect, useState, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'

interface LogLine {
  timestamp: number
  message: string
}

function parseLineColor(msg: string): { color: string; glow: string } {
  if (msg.includes('[ERROR]') || msg.includes('ERROR'))
    return { color: '#ffb4ab', glow: 'rgba(255,180,171,0.15)' }
  if (msg.includes('[WARN]'))
    return { color: '#ffd599', glow: 'rgba(255,213,153,0.1)' }
  if (msg.includes('[OK]') || msg.includes('[SUCCESS]'))
    return { color: '#5df6e0', glow: 'rgba(93,246,224,0.1)' }
  if (msg.includes('[INFO]'))
    return { color: '#b8c4ff', glow: 'rgba(184,196,255,0.08)' }
  if (msg.includes('[HERMES]') || msg.includes('HERMES >'))
    return { color: '#3cd7ff', glow: 'rgba(60,215,255,0.1)' }
  return { color: '#78868b', glow: 'transparent' }
}

export default function ActivityFeed() {
  const [logs, setLogs] = useState<LogLine[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [fetching, setFetching] = useState(false)
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

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
        {lastUpdated && (
          <span className="text-[10px] font-mono text-outline opacity-60">
            {formatDistanceToNow(lastUpdated, { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto p-3 space-y-0.5 font-mono" style={{ background: 'rgba(8, 14, 29, 0.4)' }}>
        {logs.length === 0 ? (
          <div className="text-[11px] py-4 text-center text-outline opacity-50">
            Waiting for log data...
          </div>
        ) : (
          logs.map((line, i) => {
            const isNewest = i === logs.length - 1
            const { color, glow } = parseLineColor(line.message)
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
                <span className="text-outline opacity-50 shrink-0">[{timeStr}]</span>
                <span style={{ color }}>{line.message}</span>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
