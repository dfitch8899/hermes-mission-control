'use client'

import { useState, useCallback, useEffect } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import TerminalOutput, { TerminalLine } from '@/components/terminal/TerminalOutput'
import TerminalInput from '@/components/terminal/TerminalInput'
import { v4 as uuid } from 'uuid'

const HELP_TEXT = `
HERMES MISSION CONTROL — Terminal v2.1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Available commands:
  help                     Show this help message
  clear                    Clear terminal output

  tasks list               List all tasks
  tasks add <title>        Add a new task (interactive)
  tasks update <id> <status>  Update task status
  tasks done <id>          Mark task as done

  memory list              List all memories
  memory search <query>    Search memories by query
  memory add               Add a new memory (interactive)

  ecs status               Show ECS service metrics
  ecs logs [n]             Show last N log lines (default 20)
  ecs tasks                List running ECS tasks

  calendar list            List all scheduled events

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use ↑/↓ arrows to navigate command history.
`.trim()

type MultiStepState = {
  command: 'tasks_add' | 'memory_add'
  step: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
} | null

function makeLine(type: TerminalLine['type'], content: string): TerminalLine {
  return { id: uuid(), timestamp: new Date(), type, content }
}

export default function TerminalPage() {
  const [lines, setLines] = useState<TerminalLine[]>([
    makeLine('system', 'Hermes Mission Control — Terminal v2.1'),
    makeLine('system', 'Type "help" for available commands.'),
    makeLine('info', 'Connected to hermes-agent cluster'),
    makeLine('ok', 'Agent status: ONLINE — uptime 3d 7h 22m'),
  ])
  const [processing, setProcessing] = useState(false)
  const [multiStep, setMultiStep] = useState<MultiStepState>(null)
  const [currentPrompt, setCurrentPrompt] = useState<string | undefined>(undefined)

  const addLine = useCallback((type: TerminalLine['type'], content: string) => {
    setLines(prev => [...prev, makeLine(type, content)])
  }, [])

  const addLines = useCallback((newLines: TerminalLine[]) => {
    setLines(prev => [...prev, ...newLines])
  }, [])

  const executeCommand = useCallback(async (raw: string) => {
    const cmd = raw.trim()

    // Multi-step flow
    if (multiStep) {
      if (multiStep.command === 'tasks_add') {
        if (multiStep.step === 1) {
          // Got title
          const newData = { ...multiStep.data, title: cmd }
          addLine('system', 'Priority? (low/medium/high/critical):')
          setCurrentPrompt('Priority > ')
          setMultiStep({ ...multiStep, step: 2, data: newData })
        } else if (multiStep.step === 2) {
          // Got priority
          const priorities = ['low', 'medium', 'high', 'critical']
          const priority = priorities.includes(cmd.toLowerCase()) ? cmd.toLowerCase() : 'medium'
          const prevData = multiStep.data as Record<string, string>
          setMultiStep(null)
          setCurrentPrompt(undefined)
          setProcessing(true)
          try {
            const res = await fetch('/api/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: prevData.title || '', priority, description: '', status: 'queued', assignee: 'human', tags: [], source: 'manual' }),
            })
            const data = await res.json()
            const taskId = data.task?.taskId || data.taskId || 'TX-???'
            addLine('ok', `Task created: ${taskId} — "${prevData.title || ''}" [${priority}]`)
          } catch {
            addLine('error', 'Failed to create task — check API connection')
          } finally {
            setProcessing(false)
          }
        }
        return
      }

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
          const prevMemData = multiStep.data as Record<string, string>
          setMultiStep(null)
          setCurrentPrompt(undefined)
          setProcessing(true)
          try {
            const res = await fetch('/api/memories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: prevMemData.title || '', type: prevMemData.type || 'context', content: cmd, tags: [], source: 'user', relevanceScore: 0.7 }),
            })
            const data = await res.json()
            const memId = data.memory?.memoryId || data.memoryId || 'MEM-???'
            addLine('ok', `Memory created: ${memId} — "${prevMemData.title || ''}" [${prevMemData.type || 'context'}]`)
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
    const base = parts[0].toLowerCase()
    const sub = parts[1]?.toLowerCase()

    if (base === 'help') {
      HELP_TEXT.split('\n').forEach(l => addLine('output', l))
      return
    }

    if (base === 'clear') {
      setLines([makeLine('system', 'Terminal cleared.')])
      return
    }

    if (base === 'tasks') {
      if (sub === 'list') {
        setProcessing(true)
        try {
          const res = await fetch('/api/tasks')
          const data = await res.json()
          const tasks = data.tasks || []
          if (tasks.length === 0) { addLine('info', 'No tasks found'); return }
          addLine('info', `${tasks.length} tasks:`)
          tasks.forEach((t: any) => {
            addLine('output', `  ${t.taskId}  [${t.status}]  [${t.priority}]  ${t.title}`)
          })
        } catch {
          addLine('error', 'Failed to fetch tasks')
        } finally {
          setProcessing(false)
        }
        return
      }

      if (sub === 'add') {
        const titleFromArgs = parts.slice(2).join(' ')
        if (titleFromArgs) {
          setProcessing(true)
          try {
            const res = await fetch('/api/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: titleFromArgs, priority: 'medium', description: '', status: 'queued', assignee: 'human', tags: [], source: 'manual' }),
            })
            const data = await res.json()
            const taskId = data.task?.taskId || data.taskId || 'TX-???'
            addLine('ok', `Task created: ${taskId} — "${titleFromArgs}"`)
          } catch {
            addLine('error', 'Failed to create task')
          } finally {
            setProcessing(false)
          }
        } else {
          addLine('system', 'Task title:')
          setCurrentPrompt('Title > ')
          setMultiStep({ command: 'tasks_add', step: 1, data: {} })
        }
        return
      }

      if (sub === 'update' && parts[2] && parts[3]) {
        setProcessing(true)
        try {
          const res = await fetch(`/api/tasks/${parts[2]}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: parts[3] }),
          })
          if (res.ok) {
            addLine('ok', `Task ${parts[2]} updated → ${parts[3]}`)
          } else {
            addLine('error', `Failed to update task ${parts[2]}`)
          }
        } catch {
          addLine('error', 'API error')
        } finally {
          setProcessing(false)
        }
        return
      }

      if (sub === 'done' && parts[2]) {
        setProcessing(true)
        try {
          const res = await fetch(`/api/tasks/${parts[2]}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'done', completedAt: new Date().toISOString() }),
          })
          if (res.ok) {
            addLine('ok', `Task ${parts[2]} marked as done`)
          } else {
            addLine('error', `Task ${parts[2]} not found`)
          }
        } catch {
          addLine('error', 'API error')
        } finally {
          setProcessing(false)
        }
        return
      }

      addLine('warn', 'Usage: tasks [list|add|update|done]')
      return
    }

    if (base === 'memory') {
      if (sub === 'list') {
        setProcessing(true)
        try {
          const res = await fetch('/api/memories')
          const data = await res.json()
          const mems = data.memories || []
          if (mems.length === 0) { addLine('info', 'No memories found'); return }
          addLine('info', `${mems.length} memories:`)
          mems.forEach((m: any) => {
            addLine('output', `  ${m.memoryId}  [${m.type}]  score:${Math.round((m.relevanceScore || 0) * 100)}%  ${m.title}`)
          })
        } catch {
          addLine('error', 'Failed to fetch memories')
        } finally {
          setProcessing(false)
        }
        return
      }

      if (sub === 'search' && parts.length > 2) {
        const query = parts.slice(2).join(' ')
        setProcessing(true)
        try {
          const res = await fetch(`/api/memories?search=${encodeURIComponent(query)}`)
          const data = await res.json()
          const mems = data.memories || []
          if (mems.length === 0) { addLine('info', `No results for "${query}"`); return }
          addLine('info', `${mems.length} results for "${query}":`)
          mems.forEach((m: any) => {
            addLine('output', `  ${m.memoryId}  [${m.type}]  ${m.title}`)
          })
        } catch {
          addLine('error', 'Search failed')
        } finally {
          setProcessing(false)
        }
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

    if (base === 'ecs') {
      if (sub === 'status') {
        setProcessing(true)
        try {
          const res = await fetch('/api/ecs/metrics')
          const data = await res.json()
          addLine('info', 'ECS Service: hermes-agent')
          addLine('output', `  CPU:      ${data.cpu?.toFixed(1) ?? 'N/A'}%`)
          addLine('output', `  Memory:   ${data.memory?.toFixed(1) ?? 'N/A'}%`)
          addLine('output', `  Tasks:    ${data.taskCount ?? 'N/A'} running`)
          addLine('output', `  Uptime:   ${data.uptime ? Math.round(data.uptime / 3600) + 'h' : 'N/A'}`)
        } catch {
          addLine('error', 'Failed to fetch ECS metrics')
        } finally {
          setProcessing(false)
        }
        return
      }

      if (sub === 'logs') {
        const n = parseInt(parts[2] || '20')
        setProcessing(true)
        try {
          const res = await fetch(`/api/ecs/logs?lines=${n}`)
          const data = await res.json()
          const logs = data.logs || []
          addLine('info', `Last ${logs.length} log lines:`)
          logs.forEach((l: any) => {
            const ts = new Date(l.timestamp).toLocaleTimeString('en-US', { hour12: false })
            addLine('output', `  [${ts}] ${l.message}`)
          })
        } catch {
          addLine('error', 'Failed to fetch logs')
        } finally {
          setProcessing(false)
        }
        return
      }

      if (sub === 'tasks') {
        setProcessing(true)
        try {
          const res = await fetch('/api/ecs/tasks')
          const data = await res.json()
          const tasks = data.tasks || []
          if (tasks.length === 0) { addLine('info', 'No running ECS tasks'); return }
          addLine('info', `${tasks.length} running tasks:`)
          tasks.forEach((t: any) => {
            addLine('output', `  ${t.taskArn?.split('/').pop()} — ${t.lastStatus} — ${t.cpu}cpu ${t.memory}MB`)
          })
        } catch {
          addLine('error', 'Failed to fetch ECS tasks')
        } finally {
          setProcessing(false)
        }
        return
      }

      addLine('warn', 'Usage: ecs [status|logs [n]|tasks]')
      return
    }

    if (base === 'calendar') {
      if (sub === 'list') {
        setProcessing(true)
        try {
          const res = await fetch('/api/calendar')
          const data = await res.json()
          const evts = data.events || []
          if (evts.length === 0) { addLine('info', 'No calendar events found'); return }
          addLine('info', `${evts.length} events:`)
          evts.forEach((e: any) => {
            addLine('output', `  ${e.eventId}  [${e.type}]  ${e.cronExpression || e.scheduledAt?.slice(0, 10)}  ${e.title}`)
          })
        } catch {
          addLine('error', 'Failed to fetch calendar')
        } finally {
          setProcessing(false)
        }
        return
      }
      addLine('warn', 'Usage: calendar list')
      return
    }

    addLine('error', `Unknown command: "${base}" — type "help" for available commands`)
  }, [multiStep, addLine])

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'url(/bg-terminal.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.08, zIndex: 0 }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, #0d1323 80%)', zIndex: 1 }} />
      <TopAppBar breadcrumb={['Hermes', 'Terminal']} />

      {/* Subheader with traffic lights */}
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
