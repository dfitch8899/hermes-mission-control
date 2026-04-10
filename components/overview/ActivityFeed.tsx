'use client'

import { useEffect, useState, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'

interface LogLine {
  timestamp: number
  message: string
}

function parseLineColor(msg: string): string {
  if (msg.includes('[ERROR]')) return '#ffb4ab'
  if (msg.includes('[WARN]')) return '#a8e8ff'
  if (msg.includes('[OK]') || msg.includes('[SUCCESS]')) return '#5df6e0'
  if (msg.includes('[INFO]')) return '#b8c4ff'
  if (msg.includes('[HERMES]') || msg.includes('HERMES >')) return '#a8e8ff'
  return '#bbc9cf'
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
    <div className="flex flex-col h-full rounded-2xl glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse-glow"
            style={{ backgroundColor: fetching ? '#a8e8ff' : '#5df6e0' }}
          />
          <span className="text-[10px] uppercase tracking-widest font-mono text-outline">
            Activity Feed
          </span>
        </div>
        {lastUpdated && (
          <span className="text-[10px] font-mono text-outline">
            {formatDistanceToNow(lastUpdated, { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto p-3 space-y-0.5 font-mono">
        {logs.length === 0 ? (
          <div className="text-[11px] py-4 text-center text-outline">
            Waiting for log data...
          </div>
        ) : (
          logs.map((line, i) => {
            const isNewest = i === logs.length - 1
            const msgColor = parseLineColor(line.message)
            const ts = new Date(line.timestamp)
            const timeStr = ts.toLocaleTimeString('en-US', { hour12: false })
            return (
              <div
                key={`${line.timestamp}-${i}`}
                className={`flex gap-2 text-[11px] leading-relaxed animate-fade-in-up stagger-${Math.min(i % 8 + 1, 8)}`}
              >
                {isNewest && (
                  <span
                    className="w-1 rounded-full shrink-0 mt-1 self-start animate-pulse-glow"
                    style={{ backgroundColor: '#3cd7ff', minHeight: '8px', minWidth: '4px' }}
                  />
                )}
                <span className="text-outline">[{timeStr}]</span>
                <span style={{ color: msgColor }}>{line.message}</span>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
