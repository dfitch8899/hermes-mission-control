'use client'

import { useEffect, useRef } from 'react'

export interface TerminalLine {
  id: string
  timestamp: Date
  type: 'system' | 'prompt' | 'output' | 'error' | 'warn' | 'ok' | 'info' | 'hermes'
  content: string
}

interface TerminalOutputProps {
  lines: TerminalLine[]
}

function getLineColor(type: TerminalLine['type']): string {
  switch (type) {
    case 'prompt': return '#a8e8ff'
    case 'hermes': return '#a8e8ff'
    case 'error': return '#ffb4ab'
    case 'warn': return '#a8e8ff'
    case 'ok': return '#5df6e0'
    case 'info': return '#b8c4ff'
    case 'system': return '#859398'
    default: return '#dde2f9'
  }
}

function getPrefix(type: TerminalLine['type']): string {
  switch (type) {
    case 'prompt': return 'HERMES >'
    case 'error': return '[ERROR]'
    case 'warn': return '[WARN]'
    case 'ok': return '[OK]'
    case 'info': return '[INFO]'
    case 'system': return '[SYS]'
    case 'hermes': return '[HERMES]'
    default: return ''
  }
}

export default function TerminalOutput({ lines }: TerminalOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div
      className="flex-1 overflow-y-auto p-5 space-y-0.5"
      style={{
        backgroundColor: '#080e1d',
        fontFamily: 'var(--font-jetbrains-mono)',
        fontSize: '13px',
        lineHeight: '1.8',
      }}
    >
      {lines.map((line) => {
        const color = getLineColor(line.type)
        const prefix = getPrefix(line.type)
        const ts = line.timestamp.toLocaleTimeString('en-US', { hour12: false })

        return (
          <div
            key={line.id}
            className="terminal-line-enter flex gap-3 hover:bg-white/[0.02] transition-colors duration-100 px-1 -mx-1 rounded"
          >
            <span style={{ color: '#3c494e', flexShrink: 0 }}>[{ts}]</span>
            {prefix && (
              <span style={{ color, flexShrink: 0 }}>{prefix}</span>
            )}
            <span style={{ color, flex: 1 }}>{line.content}</span>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
