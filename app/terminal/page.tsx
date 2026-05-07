'use client'

import { useState, useCallback, useRef } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import TerminalOutput, { TerminalLine } from '@/components/terminal/TerminalOutput'
import TerminalInput from '@/components/terminal/TerminalInput'
import { v4 as uuid } from 'uuid'

const HELP_TEXT = `
HERMES MISSION CONTROL — Terminal v2.2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Available commands:
  help                          Show this help message
  clear                         Clear terminal output

  tasks list                    List kanban tasks
  tasks add <title>             Create a new task
  tasks done <id>               Mark a task as done
  tasks update <id> <status>    Update task status

  memory list                   List all memories
  memory search <query>         Search memories by query
  memory add                    Add a new memory (interactive)

  ecs status                    Show ECS service metrics
  ecs logs [n]                  Show last N log lines (default 20)
  ecs tasks                     List running ECS tasks

  calendar list                 List all scheduled events

  hermes <cmd>                  Send a whitelisted command to Hermes
                                e.g.  hermes /kanban list
                                      hermes /model gpt-5.4
                                      hermes /profiles list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use ↑/↓ arrows to navigate command history.
`.trim()

type MultiStepState = {
  command: 'memory_add'
  step: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
} | null

function makeLine(type: TerminalLine['type'], content: string): TerminalLine {
  return { id: uuid(), timestamp: new Date(), type, content }
}

export default function TerminalPage() {
  const [lines, setLines] = useState<TerminalLine[]>([
    makeLine('system', 'Hermes Mission Control — Terminal v2.2'),
    makeLine('system', 'Type "help" for available commands.'),
    makeLine('info', 'Connected to hermes-agent cluster'),
  ])
  const [processing, setProcessing] = useState(false)
  const [multiStep, setMultiStep] = useState<MultiStepState>(null)
  const [currentPrompt, setCurrentPrompt] = useState<string | undefined>(undefined)
  // Ref to the mutable streaming line id
  const streamingLineId = useRef<string | null>(null)

  const addLine = useCallback((type: TerminalLine['type'], content: string) => {
    setLines(prev => [...prev, makeLine(type, content)])
  }, [])

  /** Update or append the streaming reply line */
  const setStreamLine = useCallback((text: string) => {
    setLines(prev => {
      if (streamingLineId.current) {
        return prev.map(l => l.id === streamingLineId.current ? { ...l, content: text } : l)
      }
      const newLine = makeLine('output', text)
      streamingLineId.current = newLine.id
      return [...prev, newLine]
    })
  }, [])

  // ─── hermes <cmd> — streams SSE from /api/terminal/execute ─────────────────
  const runHermesCommand = useCallback(async (command: string) => {
    setProcessing(true)
    streamingLineId.current = null
    addLine('info', '⏳ Sending to Hermes...')

    try {
      const res = await fetch('/api/terminal/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        addLine('error', err.error ?? 'Request failed')
        return
      }

      const reader = res.body?.getReader()
      if (!reader) { addLine('error', 'No response stream'); return }

      const dec = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'text_replace') setStreamLine(event.text)
            else if (event.type === 'error') addLine('error', event.message)
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      addLine('error', 'Stream error — check network connection')
    } finally {
      streamingLineId.current = null
      setProcessing(false)
    }
  }, [addLine, setStreamLine])

  // ─── Main command dispatcher ────────────────────────────────────────────────
  const executeCommand = useCallback(async (raw: string) => {
    const cmd = raw.trim()

    // Multi-step flow (memory add only)
    if (multiStep) {
      if (multiStep.command === 'memory_add') {
        if (multiStep.step === 1) {
          const newData = { ...multiStep.data, title: cmd }
          addLine('system', 'Type? (context/skill/improvement):')
          setCurrentPrompt('Type > ')
          setMultiStep({ ...multiStep, step: 2, data: newData })
        } else if (multiStep.step === 2) {
          const types = ['context', 'skill', 'improvement']
          const type = types.includes(cmd.toLowerCase()) ? cmd.toLowerCase() : 'context'
          const newData = { ...multiStep.data, type }
          addLine('system', 'Content (one line summary):')
          setCurrentPrompt('Content > ')
          setMultiStep({ ...multiStep, step: 3, data: newData })
        } else if (multiStep.step === 3) {
          const prevData = multiStep.data as Record<string, string>
          setMultiStep(null)
          setCurrentPrompt(undefined)
          setProcessing(true)
          try {
            const res = await fetch('/api/memories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: prevData.title || '', type: prevData.type || 'context',
                content: cmd, tags: [], source: 'user', relevanceScore: 0.7,
              }),
            })
            const data = await res.json()
            const memId = data.memory?.memoryId || data.memoryId || 'MEM-???'
            addLine('ok', `Memory created: ${memId} — "${prevData.title || ''}" [${prevData.type || 'context'}]`)
          } catch {
            addLine('error', 'Failed to create memory — check API connection')
          } finally {
            setProcessing(false)
          }
        }
        return
      }
    }

    // Echo command
    addLine('prompt', cmd)

    const parts = cmd.split(/\s+/)
    const base  = parts[0].toLowerCase()
    const sub   = parts[1]?.toLowerCase()

    if (base === 'help') {
      HELP_TEXT.split('\n').forEach(l => addLine('output', l))
      return
    }

    if (base === 'clear') {
      setLines([makeLine('system', 'Terminal cleared.')])
      return
    }

    // ── tasks ─── rewired to /api/kanban (real DDB, no dead /api/tasks calls)
    if (base === 'tasks') {
      if (sub === 'list') {
        setProcessing(true)
        try {
          const res = await fetch('/api/kanban')
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tasks: any[] = data.tasks ?? []
          if (tasks.length === 0) { addLine('info', 'No tasks found'); return }
          addLine('info', `${tasks.length} tasks:`)
          tasks.forEach(t => {
            addLine('output', `  ${t.taskId}  [${t.status}]  [${t.priority}]  ${t.title}`)
          })
        } catch { addLine('error', 'Failed to fetch tasks') }
        finally   { setProcessing(false) }
        return
      }

      if (sub === 'add') {
        const title = parts.slice(2).join(' ')
        if (!title) { addLine('warn', 'Usage: tasks add <title>'); return }
        setProcessing(true)
        try {
          const res = await fetch('/api/kanban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, status: 'triage', assignee: 'general', priority: 'normal' }),
          })
          const data = await res.json()
          const taskId = data.task?.taskId ?? data.taskId ?? '???'
          addLine('ok', `Task created: ${taskId} — "${title}"`)
        } catch { addLine('error', 'Failed to create task') }
        finally   { setProcessing(false) }
        return
      }

      if (sub === 'done' && parts[2]) {
        setProcessing(true)
        try {
          const res = await fetch(`/api/kanban/${parts[2]}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'done' }),
          })
          if (res.ok) addLine('ok', `Task ${parts[2]} marked as done`)
          else        addLine('error', `Task ${parts[2]} not found`)
        } catch { addLine('error', 'API error') }
        finally   { setProcessing(false) }
        return
      }

      if (sub === 'update' && parts[2] && parts[3]) {
        setProcessing(true)
        try {
          const res = await fetch(`/api/kanban/${parts[2]}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: parts[3] }),
          })
          if (res.ok) addLine('ok', `Task ${parts[2]} → ${parts[3]}`)
          else        addLine('error', `Failed to update task ${parts[2]}`)
        } catch { addLine('error', 'API error') }
        finally   { setProcessing(false) }
        return
      }

      addLine('warn', 'Usage: tasks [list|add <title>|done <id>|update <id> <status>]')
      return
    }

    // ── memory
    if (base === 'memory') {
      if (sub === 'list') {
        setProcessing(true)
        try {
          const res = await fetch('/api/memories')
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mems: any[] = data.memories ?? []
          if (mems.length === 0) { addLine('info', 'No memories found'); return }
          addLine('info', `${mems.length} memories:`)
          mems.forEach(m => {
            addLine('output', `  ${m.memoryId}  [${m.type}]  score:${Math.round((m.relevanceScore ?? 0) * 100)}%  ${m.title}`)
          })
        } catch { addLine('error', 'Failed to fetch memories') }
        finally   { setProcessing(false) }
        return
      }

      if (sub === 'search' && parts.length > 2) {
        const query = parts.slice(2).join(' ')
        setProcessing(true)
        try {
          const res = await fetch(`/api/memories?search=${encodeURIComponent(query)}`)
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mems: any[] = data.memories ?? []
          if (mems.length === 0) { addLine('info', `No results for "${query}"`); return }
          addLine('info', `${mems.length} results for "${query}":`)
          mems.forEach(m => addLine('output', `  ${m.memoryId}  [${m.type}]  ${m.title}`))
        } catch { addLine('error', 'Search failed') }
        finally   { setProcessing(false) }
        return
      }

      if (sub === 'add') {
        addLine('system', 'Memory title:')
        setCurrentPrompt('Title > ')
        setMultiStep({ command: 'memory_add', step: 1, data: {} })
        return
      }

      addLine('warn', 'Usage: memory [list|search <query>|add]')
      return
    }

    // ── ecs
    if (base === 'ecs') {
      if (sub === 'status') {
        setProcessing(true)
        try {
          const res = await fetch('/api/ecs/metrics')
          const data = await res.json()
          addLine('info', 'ECS Service: hermes-agent')
          addLine('output', `  CPU:    ${data.cpu?.toFixed(1) ?? 'N/A'}%`)
          addLine('output', `  Memory: ${data.memory?.toFixed(1) ?? 'N/A'}%`)
          addLine('output', `  Tasks:  ${data.taskCount ?? 'N/A'} running`)
          addLine('output', `  Uptime: ${data.uptime ? Math.round(data.uptime / 3600) + 'h' : 'N/A'}`)
        } catch { addLine('error', 'Failed to fetch ECS metrics') }
        finally   { setProcessing(false) }
        return
      }

      if (sub === 'logs') {
        const n = parseInt(parts[2] || '20')
        setProcessing(true)
        try {
          const res = await fetch(`/api/ecs/logs?lines=${n}`)
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const logs: any[] = data.logs ?? []
          addLine('info', `Last ${logs.length} log lines:`)
          logs.forEach(l => {
            const ts = new Date(l.timestamp).toLocaleTimeString('en-US', { hour12: false })
            addLine('output', `  [${ts}] ${l.message}`)
          })
        } catch { addLine('error', 'Failed to fetch logs') }
        finally   { setProcessing(false) }
        return
      }

      if (sub === 'tasks') {
        setProcessing(true)
        try {
          const res = await fetch('/api/ecs/tasks')
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tasks: any[] = data.tasks ?? []
          if (tasks.length === 0) { addLine('info', 'No running ECS tasks'); return }
          addLine('info', `${tasks.length} running tasks:`)
          tasks.forEach(t => {
            addLine('output', `  ${t.taskArn?.split('/').pop()} — ${t.lastStatus} — ${t.cpu}cpu ${t.memory}MB`)
          })
        } catch { addLine('error', 'Failed to fetch ECS tasks') }
        finally   { setProcessing(false) }
        return
      }

      addLine('warn', 'Usage: ecs [status|logs [n]|tasks]')
      return
    }

    // ── calendar
    if (base === 'calendar') {
      if (sub === 'list') {
        setProcessing(true)
        try {
          const res = await fetch('/api/calendar')
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const evts: any[] = data.events ?? []
          if (evts.length === 0) { addLine('info', 'No calendar events found'); return }
          addLine('info', `${evts.length} events:`)
          evts.forEach(e => {
            addLine('output', `  ${e.eventId}  [${e.type}]  ${e.cronExpression || e.scheduledAt?.slice(0, 10)}  ${e.title}`)
          })
        } catch { addLine('error', 'Failed to fetch calendar') }
        finally   { setProcessing(false) }
        return
      }
      addLine('warn', 'Usage: calendar list')
      return
    }

    // ── hermes <cmd> — forward whitelisted commands to Hermes via execute route
    if (base === 'hermes') {
      const hermesCmd = parts.slice(1).join(' ').trim()
      if (!hermesCmd) { addLine('warn', 'Usage: hermes <cmd>  (e.g. hermes /kanban list)'); return }
      await runHermesCommand(hermesCmd)
      return
    }

    addLine('error', `Unknown command: "${base}" — type "help" for available commands`)
  }, [multiStep, addLine, runHermesCommand])

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'url(/bg-terminal.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.08, zIndex: 0 }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, #0d1323 80%)', zIndex: 1 }} />
      <TopAppBar breadcrumb={['Hermes', 'Terminal']} />

      {/* Subheader */}
      <div
        className="flex items-center gap-3 px-5 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(13,19,35,0.6)', position: 'relative', zIndex: 2 }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(255,180,171,0.6)' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(168,232,255,0.4)' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(93,246,224,0.6)' }} />
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-outline">hermes-agent — terminal</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ backgroundColor: '#5df6e0' }} />
          <span className="text-[10px] font-mono" style={{ color: '#5df6e0' }}>CONNECTED</span>
        </div>
      </div>

      {/* Output */}
      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TerminalOutput lines={lines} />
      </div>

      {/* Input */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        <TerminalInput
          onCommand={executeCommand}
          disabled={processing}
          prompt={currentPrompt ?? '▸ HERMES ~$ '}
        />
      </div>
    </div>
  )
}
