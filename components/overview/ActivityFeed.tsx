'use client'

import { useEffect, useState, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'

interface LogLine {
  timestamp: number
  message: string
}

function parseLineColor(msg: string): string {
  if (msg.includes('[ERROR]')) return '#F85149'
  if (msg.includes('[WARN]')) return '#FFB300'
  if (msg.includes('[OK]') || msg.includes('[SUCCESS]')) return '#3FB950'
  if (msg.includes('[INFO]')) return '#388BFD'
  if (msg.includes('[HERMES]') || msg.includes('HERMES >')) return '#FFB300'
  return '#8B949E'
}

export default function ActivityFeed() {
  const [logs, setLogs] = useState<LogLine[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [fetching, setFetching] = useState(false)
  const [tick, setTick] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function fetchLogs() {
    setFetching(true)
    try {
      const res = await fetch('/api/ecs/logs?lines=50')
      if (res.ok) {
        const data = await res.json()
        if (data.logs && Array.isArray(data.logs)) {
          setLogs(data.logs)
        }
      }
    } catch {
      // silently fail
    } finally {
      setFetching(false)
      setLastUpdated(new Date())
    }
  }

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 10000)
    return () => clearInterval(interval)
  }, [])

  // Update "X seconds ago" ticker
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div
      className="flex flex-col h-full rounded"
      style={{
        backgroundColor: '#161B22',
        border: '0.5px solid #30363D',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '0.5px solid #30363D' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: fetching ? '#FFB300' : '#3FB950',
              animation: 'pulseAmber 2s ease-in-out infinite',
            }}
          />
          <span className="text-[10px] uppercase tracking-widest font-mono" style={{ color: '#8B949E' }}>
            Activity Feed
          </span>
        </div>
        {lastUpdated && (
          <span className="text-[10px] font-mono" style={{ color: '#484F58' }}>
            {formatDistanceToNow(lastUpdated, { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono">
        {logs.length === 0 ? (
          <div className="text-[11px] py-4 text-center" style={{ color: '#484F58' }}>
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
                    className="w-1 rounded-full shrink-0 mt-1 self-start animate-pulse-amber"
                    style={{ backgroundColor: '#FFB300', minHeight: '8px', minWidth: '4px' }}
                  />
                )}
                <span style={{ color: '#484F58' }}>[{timeStr}]</span>
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
