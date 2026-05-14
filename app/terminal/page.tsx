'use client'

import { useState, useCallback, useRef } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import TerminalOutput, { TerminalLine } from '@/components/terminal/TerminalOutput'
import TerminalInput from '@/components/terminal/TerminalInput'
import { v4 as uuid } from 'uuid'

// ─── Hermes bare-word commands that should be forwarded with a / prefix ─────
// These are Hermes CLI commands the user may type without a leading /.
const HERMES_BARE_CMDS = new Set([
  'new', 'reset', 'stop', 'status', 'history', 'save', 'retry', 'undo',
  'title', 'compress', 'rollback', 'snapshot', 'snap', 'branch', 'fork', 'resume', 'redraw',
  'background', 'bg', 'btw', 'queue', 'q', 'steer', 'goal',
  'config', 'personality', 'verbose', 'fast', 'reasoning', 'skin', 'voice',
  'yolo', 'footer', 'busy', 'indicator', 'statusbar', 'sb',
  'tools', 'toolsets', 'browser', 'skills', 'cron', 'curator',
  'reload-mcp', 'reload_mcp', 'reload', 'plugins',
  'usage', 'insights', 'platforms', 'gateway', 'debug', 'profile',
  'gquota', 'copy', 'paste', 'image',
  'approve', 'deny', 'sethome', 'update', 'restart', 'commands',
])

// ─── Commands handled locally (MC direct API — no Hermes relay needed) ──────
const LOCAL_CMDS = new Set([
  'help', 'clear', 'exit', 'quit', 'ping',
  'model', 'kanban', 'tasks', 'memory', 'ecs', 'calendar', 'sync', 'hermes',
])

const HELP_TEXT = `
HERMES MISSION CONTROL — Terminal v3.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MISSION CONTROL COMMANDS  (direct API, no Hermes relay):

  help                          Show this help message
  clear                         Clear terminal output
  ping                          Test direct transport connectivity to Hermes dashboard

  model                         Show active model
  model list                    List all available models
  model <name>                  Switch active model
  model set <name>              Switch active model (explicit form)

  kanban list [--status=<s>]    List tasks  (status: triage/todo/ready/running/done/blocked)
  kanban add <title>            Create a task
  kanban create <title>         Alias for kanban add  (supports --assignee / --priority flags)
  kanban show <id>              Show task detail + comments
  kanban done <id> [result]     Mark task as done
  kanban block <id> [reason]    Mark task as blocked
  kanban unblock <id>           Unblock a task (sets status → todo)
  kanban assign <id> <agent>    Assign to an agent
  kanban comment <id> <text>    Add a comment
  kanban archive <id>           Archive a task
  kanban dispatch               Ask Hermes to dispatch pending tasks

  memory list                   List all memories
  memory search <query>         Search memories
  memory add                    Add a memory (interactive)

  ecs status                    ECS service metrics
  ecs logs [n]                  Last N log lines (default 20)
  ecs tasks                     Running ECS tasks

  calendar list                 Scheduled events

  sync                          Sync Hermes data to Mission Control

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HERMES SLASH COMMANDS  (forwarded to Hermes agent):

  Session
  /new  /reset              Start fresh conversation
  /stop                     Interrupt current execution
  /status                   Session details
  /history                  Conversation record
  /save                     Preserve current chat
  /retry                    Resend last message
  /undo                     Remove last exchange
  /title [name]             Label the session
  /compress [topic]         Condense context
  /rollback [n]             Revert to filesystem snapshot
  /snapshot [create|restore|prune]  Manage state checkpoints  (/snap)
  /branch [name]            Create alternate conversation path  (/fork)
  /resume [name]            Restore named session

  Queue & Steering
  /background <prompt>      Run task in separate session  (/bg, /btw)
  /queue <prompt>           Buffer next input without interrupting  (/q)
  /steer <prompt>           Inject guidance mid-execution
  /goal <text>              Set persistent objective
    /goal status|pause|resume|clear

  Configuration
  /config                   View current settings
  /model [name]             Switch active model (also handled locally)
  /personality              Choose personality overlay
  /verbose                  Cycle tool progress display
  /fast [normal|fast|status]  Toggle priority processing
  /reasoning [level|show|hide]  Adjust reasoning visibility
  /voice [on|off|tts|status]  Audio controls
  /yolo                     Skip approval prompts

  Tools & Skills
  /tools [list|enable|disable]  Manage tool access
  /skills                   Browse / install / audit skills
  /plugins                  List installed plugins
  /cron [list|add|edit|…]   Scheduled automation
  /curator [status|run|pin|archive]  Background skill maintenance
  /browser [connect|disconnect|status]  Chrome connection
  /reload-mcp               Refresh MCP server config  (/reload_mcp)
  /reload                   Reload environment variables

  Information
  /usage                    Token consumption & cost breakdown
  /insights [days]          30-day usage analytics
  /debug                    Shareable diagnostic report
  /profile                  Active profile name and directory
  /gquota                   Gemini quota progress
  /platforms                Messaging platform status  (/gateway)

  Messaging Platform
  /approve [session|always] Authorize pending dangerous command
  /deny                     Reject pending dangerous command
  /restart                  Gracefully restart gateway

  Dynamic
  /<skill-name>             Invoke any installed skill
  /help                     Show Hermes command reference

  Tip: Any /command not listed above is forwarded to Hermes.
  Bare-word forms (status, usage, debug …) also work without the /.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use ↑/↓ arrows to navigate command history.
`.trim()

// ─── Types ────────────────────────────────────────────────────────────────────
type MultiStepState = {
  command: 'memory_add'
  step: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
} | null

function makeLine(type: TerminalLine['type'], content: string): TerminalLine {
  return { id: uuid(), timestamp: new Date(), type, content }
}

// ─── Argument parsing helpers ─────────────────────────────────────────────────

/** Parse a command line respecting double/single-quoted strings. */
function parseArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuote = false
  let quoteChar = ''
  for (const ch of input) {
    if (inQuote) {
      if (ch === quoteChar) inQuote = false
      else current += ch
    } else if (ch === '"' || ch === "'") {
      inQuote = true; quoteChar = ch
    } else if (ch === ' ' || ch === '\t') {
      if (current) { args.push(current); current = '' }
    } else {
      current += ch
    }
  }
  if (current) args.push(current)
  return args
}

/**
 * Extract --flag=value or --flag value from an args array.
 * Mutates the array by removing matched elements. Returns undefined if not found.
 */
function extractFlag(args: string[], ...flags: string[]): string | undefined {
  for (const flag of flags) {
    const eqIdx = args.findIndex(a => a.toLowerCase().startsWith(`${flag}=`))
    if (eqIdx >= 0) {
      const val = args[eqIdx].slice(flag.length + 1)
      args.splice(eqIdx, 1)
      return val
    }
    const spIdx = args.findIndex(a => a.toLowerCase() === flag)
    if (spIdx >= 0 && spIdx < args.length - 1) {
      const val = args[spIdx + 1]
      args.splice(spIdx, 2)
      return val
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function TerminalPage() {
  const [lines, setLines] = useState<TerminalLine[]>([
    makeLine('system', 'Hermes Mission Control — Terminal v3.0'),
    makeLine('system', 'Type "help" for available commands.  All Hermes /commands are supported.'),
    makeLine('info', 'Connected to hermes-agent cluster'),
  ])
  const [processing, setProcessing] = useState(false)
  const [multiStep, setMultiStep] = useState<MultiStepState>(null)
  const [currentPrompt, setCurrentPrompt] = useState<string | undefined>(undefined)
  const streamingLineId = useRef<string | null>(null)
  const statusLineId    = useRef<string | null>(null)

  const addLine = useCallback((type: TerminalLine['type'], content: string) => {
    setLines(prev => [...prev, makeLine(type, content)])
  }, [])

  const removeStatusLine = useCallback(() => {
    if (!statusLineId.current) return
    const id = statusLineId.current
    statusLineId.current = null
    setLines(prev => prev.filter(l => l.id !== id))
  }, [])

  const addLines = useCallback((newLines: Array<{ type: TerminalLine['type']; content: string }>) => {
    setLines(prev => [...prev, ...newLines.map(l => makeLine(l.type, l.content))])
  }, [])

  /** Update or append the streaming reply line. */
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

  // ─── SSE streaming helper — forwards commands to Hermes via chatSend ─────────
  const runHermesCommand = useCallback(async (command: string) => {
    setProcessing(true)
    streamingLineId.current = null
    // Track the status line so we can replace it when the result arrives.
    const statusLine = makeLine('info', '⏳ Sending to Hermes...')
    statusLineId.current = statusLine.id
    setLines(prev => [...prev, statusLine])

    let sawEvent = false
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 40_000)

    try {
      const res = await fetch('/api/terminal/execute', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ command }),
        signal:  controller.signal,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        removeStatusLine()
        addLine('error', err.error ?? 'Request failed')
        return
      }
      const reader = res.body?.getReader()
      if (!reader) { removeStatusLine(); addLine('error', 'No response stream'); return }
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
            if (event.type === 'text_replace') {
              removeStatusLine()
              sawEvent = true
              setStreamLine(event.text)
            } else if (event.type === 'error') {
              removeStatusLine()
              sawEvent = true
              const msg = String(event.message ?? 'Unknown error').replace(/^Error:\s*/, '')
              addLine('error', msg)
            } else if (event.type === 'done') {
              // Server signalled completion; nothing to render but mark seen so
              // the stream-close fallback doesn't fire.
              sawEvent = true
            }
            // 'status' events are intentionally ignored — they're connecting noise.
          } catch { /* skip malformed */ }
        }
      }
      if (!sawEvent) {
        removeStatusLine()
        addLine('error', '(no response from Hermes — server closed stream silently)')
      }
    } catch (err) {
      removeStatusLine()
      const aborted = (err as Error)?.name === 'AbortError'
      addLine('error', aborted
        ? 'Hermes did not respond within 40s — check that the dashboard is running'
        : 'Stream error — check network connection')
    } finally {
      clearTimeout(timeout)
      streamingLineId.current = null
      statusLineId.current    = null
      setProcessing(false)
    }
  }, [addLine, removeStatusLine, setStreamLine])

  // ─── Main command dispatcher ─────────────────────────────────────────────────
  const executeCommand = useCallback(async (rawInput: string) => {
    const raw = rawInput.trim()
    if (!raw) return

    // ── Multi-step flow (memory add) ────────────────────────────────────────────
    if (multiStep?.command === 'memory_add') {
      if (multiStep.step === 1) {
        setMultiStep({ ...multiStep, step: 2, data: { ...multiStep.data, title: raw } })
        addLine('system', 'Type? (context / skill / improvement):')
        setCurrentPrompt('Type > ')
      } else if (multiStep.step === 2) {
        const validTypes = ['context', 'skill', 'improvement']
        const type = validTypes.includes(raw.toLowerCase()) ? raw.toLowerCase() : 'context'
        setMultiStep({ ...multiStep, step: 3, data: { ...multiStep.data, type } })
        addLine('system', 'Content (one-line summary):')
        setCurrentPrompt('Content > ')
      } else if (multiStep.step === 3) {
        const prev = multiStep.data as Record<string, string>
        setMultiStep(null)
        setCurrentPrompt(undefined)
        setProcessing(true)
        try {
          const res = await fetch('/api/memories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: prev.title ?? '', type: prev.type ?? 'context', content: raw, tags: [], source: 'user', relevanceScore: 0.7 }),
          })
          const data = await res.json()
          addLine('ok', `Memory created: ${data.memory?.memoryId ?? data.memoryId ?? '???'} — "${prev.title}" [${prev.type}]`)
        } catch { addLine('error', 'Failed to create memory') }
        finally   { setProcessing(false) }
      }
      return
    }

    // Echo the command
    addLine('prompt', raw)

    // Parse: strip leading / so /model and model both work the same
    const stripped = raw.replace(/^\//, '')
    const parts    = parseArgs(stripped)
    const base     = parts[0]?.toLowerCase() ?? ''
    const sub      = parts[1]?.toLowerCase()

    // ── ping — diagnostic: test direct transport connectivity ───────────────────
    if (base === 'ping') {
      setProcessing(true)
      try {
        const res  = await fetch('/api/hermes/ping')
        const data = await res.json()
        addLine('info', `Transport: ${data.transport}  |  URL: ${data.dashboardUrl ?? 'not set'}`)
        addLine('output', `  Key configured: ${data.keyConfigured ? 'yes (' + data.keyPrefix + ')' : 'NO'}`)
        if (data.ok) {
          addLine('ok', `✓ Hermes dashboard reachable`)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const providers: any[] = data.model?.body?.providers ?? []
          if (providers.length) {
            addLine('output', '  Providers:')
            providers.forEach((p: { slug: string; is_current: boolean; current_model?: string }) => {
              const active = p.is_current ? ' ◀ active' : ''
              addLine('output', `    ${p.slug}${active}${p.current_model ? '  model=' + p.current_model : ''}`)
            })
          }
        } else {
          addLine('error', `✗ ${data.diagnosis ?? data.reason ?? 'Hermes unreachable'}`)
          if (data.exec || data.model) {
            addLine('output', `  Exec probe:  HTTP ${data.exec?.httpStatus ?? 'no response'}`)
            addLine('output', `  Model probe: HTTP ${data.model?.httpStatus ?? 'no response'}`)
          }
          if (data.transport !== 'direct') {
            addLine('warn', '→ Restart MC after updating .env.local with HERMES_TRANSPORT=direct')
          } else if (!data.kanban?.reachable) {
            addLine('warn', '→ Start port forward:  .\\scripts\\hermes-forward.ps1  (PowerShell)')
          }
        }
      } catch { addLine('error', 'Ping request failed') }
      finally   { setProcessing(false) }
      return
    }

    // ── help / clear ─────────────────────────────────────────────────────────────
    if (base === 'help') {
      HELP_TEXT.split('\n').forEach(l => addLine('output', l))
      return
    }
    if (base === 'clear') {
      setLines([makeLine('system', 'Terminal cleared.')])
      return
    }
    if (base === 'exit' || base === 'quit') {
      addLine('info', 'Use your browser tab to close Mission Control.')
      return
    }

    // ── model ─────────────────────────────────────────────────────────────────────
    if (base === 'model') {
      if (!sub) {
        // model → show active model
        setProcessing(true)
        try {
          const res  = await fetch('/api/hermes/model')
          const data = await res.json()
          addLine('info', `Active model: ${data.model ?? 'unknown'}`)
          if (data.provider) addLine('output', `  Provider: ${data.provider}`)
        } catch { addLine('error', 'Failed to fetch model info') }
        finally   { setProcessing(false) }
        return
      }

      if (sub === 'list') {
        // model list → list available models
        setProcessing(true)
        try {
          const res  = await fetch('/api/hermes/model')
          const data = await res.json()
          addLine('info', `Active model: ${data.model ?? 'unknown'}`)
          if (data.options?.length) {
            addLine('output', 'Available models:')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.options.forEach((o: any) => {
              const active = o.value === data.model ? ' ◀ active' : ''
              addLine('output', `  ${(o.value ?? o.label ?? '').padEnd(36)} ${o.label ?? ''}${active}`)
            })
          }
        } catch { addLine('error', 'Failed to fetch model list') }
        finally   { setProcessing(false) }
        return
      }

      // model set <name>  OR  model <name>  (shorthand — same effect)
      const modelName = sub === 'set' ? parts[2] : sub
      if (!modelName) { addLine('warn', 'Usage: model [list | set <name> | <name>]'); return }
      setProcessing(true)
      try {
        const res  = await fetch('/api/hermes/model', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ model: modelName }),
        })
        const data = await res.json()
        if (res.ok) addLine('ok', `Model switched to: ${data.model ?? modelName}`)
        else        addLine('error', data.error ?? 'Failed to set model')
      } catch { addLine('error', 'Failed to set model') }
      finally   { setProcessing(false) }
      return
    }

    // ── kanban ───────────────────────────────────────────────────────────────────
    if (base === 'kanban') {
      // kanban list [--status=<s>]
      if (!sub || sub === 'list') {
        const statusFlag = parts.find(p => p.startsWith('--status='))?.split('=')[1]
        setProcessing(true)
        try {
          const url  = '/api/kanban' + (statusFlag ? `?status=${statusFlag}` : '')
          const res  = await fetch(url)
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tasks: any[] = data.tasks ?? []
          if (!tasks.length) { addLine('info', 'No tasks found'); return }
          addLine('info', `${tasks.length} task${tasks.length !== 1 ? 's' : ''}:`)
          tasks.forEach(t => {
            const assignee = t.assignee ? ` [${t.assignee}]` : ''
            addLine('output', `  ${(t.taskId ?? '?').padEnd(16)} [${(t.status ?? '?').padEnd(8)}] [${(t.priority ?? '?').padEnd(6)}]${assignee}  ${t.title}`)
          })
        } catch { addLine('error', 'Failed to fetch tasks') }
        finally   { setProcessing(false) }
        return
      }

      // kanban add <title>  OR  kanban create <title> [--assignee <a>] [--priority <p>]
      if (sub === 'add' || sub === 'create') {
        const mutableParts = parts.slice(2)
        const assignee = extractFlag(mutableParts, '--assignee') ?? 'general'
        const priority = extractFlag(mutableParts, '--priority') ?? 'normal'
        const title    = mutableParts.join(' ').trim()
        if (!title) { addLine('warn', 'Usage: kanban add <title>'); return }
        setProcessing(true)
        try {
          const res  = await fetch('/api/kanban', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ title, status: 'triage', assignee, priority }),
          })
          const data = await res.json()
          addLine('ok', `Task created: ${data.taskId ?? '???'} — "${title}"`)
        } catch { addLine('error', 'Failed to create task') }
        finally   { setProcessing(false) }
        return
      }

      // kanban show <id>
      if (sub === 'show' && parts[2]) {
        setProcessing(true)
        try {
          const res  = await fetch(`/api/kanban/${parts[2]}`)
          const data = await res.json()
          if (!res.ok) { addLine('error', data.error ?? 'Task not found'); return }
          const t = data.task
          addLine('info', `Task: ${t.taskId}`)
          addLines([
            { type: 'output', content: `  Title:    ${t.title}` },
            { type: 'output', content: `  Status:   ${t.status}` },
            { type: 'output', content: `  Priority: ${t.priority}` },
            { type: 'output', content: `  Assignee: ${t.assignee ?? '—'}` },
          ])
          if (t.body)         addLine('output', `  Body:     ${t.body}`)
          if (t.blockReason)  addLine('output', `  Blocked:  ${t.blockReason}`)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const comments: any[] = data.comments ?? []
          if (comments.length) {
            addLine('output', `  Comments (${comments.length}):`)
            comments.forEach(c => {
              const ts = c.ts ? new Date(c.ts).toLocaleString() : '?'
              addLine('output', `    [${ts}] ${c.author ?? 'unknown'}: ${c.body}`)
            })
          }
        } catch { addLine('error', 'Failed to fetch task') }
        finally   { setProcessing(false) }
        return
      }

      // kanban done <id> [result]
      if (sub === 'done' && parts[2]) {
        const result = parts.slice(3).join(' ') || undefined
        setProcessing(true)
        try {
          const body: Record<string, string> = { status: 'done' }
          if (result) body.result = result
          const res = await fetch(`/api/kanban/${parts[2]}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
          })
          if (res.ok) addLine('ok', `Task ${parts[2]} marked as done${result ? ` — "${result}"` : ''}`)
          else        addLine('error', `Task ${parts[2]} not found or update failed`)
        } catch { addLine('error', 'API error') }
        finally   { setProcessing(false) }
        return
      }

      // kanban block <id> [reason]
      if (sub === 'block' && parts[2]) {
        const reason = parts.slice(3).join(' ') || undefined
        setProcessing(true)
        try {
          const body: Record<string, string> = { status: 'blocked' }
          if (reason) body.reason = reason
          const res = await fetch(`/api/kanban/${parts[2]}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
          })
          if (res.ok) addLine('ok', `Task ${parts[2]} blocked${reason ? ` — ${reason}` : ''}`)
          else        addLine('error', `Task ${parts[2]} not found or update failed`)
        } catch { addLine('error', 'API error') }
        finally   { setProcessing(false) }
        return
      }

      // kanban unblock <id>
      if (sub === 'unblock' && parts[2]) {
        setProcessing(true)
        try {
          const res = await fetch(`/api/kanban/${parts[2]}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ status: 'todo' }),
          })
          if (res.ok) addLine('ok', `Task ${parts[2]} unblocked (status → todo)`)
          else        addLine('error', `Task ${parts[2]} not found or update failed`)
        } catch { addLine('error', 'API error') }
        finally   { setProcessing(false) }
        return
      }

      // kanban assign <id> <agent>
      if (sub === 'assign' && parts[2] && parts[3]) {
        setProcessing(true)
        try {
          const res = await fetch(`/api/kanban/${parts[2]}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ assignee: parts[3] }),
          })
          if (res.ok) addLine('ok', `Task ${parts[2]} assigned to ${parts[3]}`)
          else        addLine('error', `Failed to assign task ${parts[2]}`)
        } catch { addLine('error', 'API error') }
        finally   { setProcessing(false) }
        return
      }

      // kanban comment <id> <text>
      if (sub === 'comment' && parts[2] && parts.length > 3) {
        const text = parts.slice(3).join(' ')
        setProcessing(true)
        try {
          const res = await fetch(`/api/kanban/${parts[2]}/comments`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ text }),   // ← route expects { text }, not { body }
          })
          if (res.ok) addLine('ok', `Comment added to ${parts[2]}`)
          else        addLine('error', `Failed to add comment to ${parts[2]}`)
        } catch { addLine('error', 'API error') }
        finally   { setProcessing(false) }
        return
      }

      // kanban archive <id>
      if (sub === 'archive' && parts[2]) {
        setProcessing(true)
        try {
          const res = await fetch(`/api/kanban/${parts[2]}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ archived: true }),
          })
          if (res.ok) addLine('ok', `Task ${parts[2]} archived`)
          else        addLine('error', `Task ${parts[2]} not found`)
        } catch { addLine('error', 'API error') }
        finally   { setProcessing(false) }
        return
      }

      // kanban dispatch → forward to Hermes (assigns pending tasks to agents)
      if (sub === 'dispatch') {
        await runHermesCommand('/kanban dispatch')
        return
      }

      addLine('warn', 'Usage: kanban [list | add <title> | create <title> | show <id> | done <id> | block <id> | unblock <id> | assign <id> <agent> | comment <id> <text> | archive <id> | dispatch]')
      return
    }

    // ── tasks → alias for kanban ──────────────────────────────────────────────────
    if (base === 'tasks') {
      const remapped = ['kanban', ...parts.slice(1)].join(' ')
      addLine('info', `(routing to: ${remapped})`)
      await executeCommand(remapped)
      return
    }

    // ── memory ────────────────────────────────────────────────────────────────────
    if (base === 'memory') {
      if (sub === 'list') {
        setProcessing(true)
        try {
          const res  = await fetch('/api/memories')
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mems: any[] = data.memories ?? []
          if (!mems.length) { addLine('info', 'No memories found'); return }
          addLine('info', `${mems.length} memor${mems.length !== 1 ? 'ies' : 'y'}:`)
          mems.forEach(m => {
            const score = Math.round((m.relevanceScore ?? 0) * 100)
            addLine('output', `  ${(m.memoryId ?? '?').padEnd(20)} [${(m.type ?? '?').padEnd(12)}] ${score}%  ${m.title}`)
          })
        } catch { addLine('error', 'Failed to fetch memories') }
        finally   { setProcessing(false) }
        return
      }
      if (sub === 'search' && parts.length > 2) {
        const query = parts.slice(2).join(' ')
        setProcessing(true)
        try {
          const res  = await fetch(`/api/memories?search=${encodeURIComponent(query)}`)
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mems: any[] = data.memories ?? []
          if (!mems.length) { addLine('info', `No results for "${query}"`); return }
          addLine('info', `${mems.length} result${mems.length !== 1 ? 's' : ''} for "${query}":`)
          mems.forEach(m => addLine('output', `  ${(m.memoryId ?? '?').padEnd(20)} [${m.type ?? '?'}]  ${m.title}`))
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
      addLine('warn', 'Usage: memory [list | search <query> | add]')
      return
    }

    // ── ecs ────────────────────────────────────────────────────────────────────────
    if (base === 'ecs') {
      if (sub === 'status') {
        setProcessing(true)
        try {
          const res  = await fetch('/api/ecs/metrics')
          const data = await res.json()
          addLine('info', 'ECS Service: hermes-agent')
          addLines([
            { type: 'output', content: `  CPU:    ${data.cpu?.toFixed(1) ?? 'N/A'}%` },
            { type: 'output', content: `  Memory: ${data.memory?.toFixed(1) ?? 'N/A'}%` },
            { type: 'output', content: `  Tasks:  ${data.taskCount ?? 'N/A'} running` },
            { type: 'output', content: `  Uptime: ${data.uptime ? Math.round(data.uptime / 3600) + 'h' : 'N/A'}` },
          ])
        } catch { addLine('error', 'Failed to fetch ECS metrics') }
        finally   { setProcessing(false) }
        return
      }
      if (sub === 'logs') {
        const n = parseInt(parts[2] || '20', 10)
        setProcessing(true)
        try {
          const res  = await fetch(`/api/ecs/logs?lines=${n}`)
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const logs: any[] = data.logs ?? []
          addLine('info', `Last ${logs.length} log line${logs.length !== 1 ? 's' : ''}:`)
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
          const res  = await fetch('/api/ecs/tasks')
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tasks: any[] = data.tasks ?? []
          if (!tasks.length) { addLine('info', 'No running ECS tasks'); return }
          addLine('info', `${tasks.length} running task${tasks.length !== 1 ? 's' : ''}:`)
          tasks.forEach(t => addLine('output', `  ${t.taskArn?.split('/').pop()} — ${t.lastStatus} — ${t.cpu}cpu ${t.memory}MB`))
        } catch { addLine('error', 'Failed to fetch ECS tasks') }
        finally   { setProcessing(false) }
        return
      }
      addLine('warn', 'Usage: ecs [status | logs [n] | tasks]')
      return
    }

    // ── calendar ───────────────────────────────────────────────────────────────────
    if (base === 'calendar') {
      if (!sub || sub === 'list') {
        setProcessing(true)
        try {
          const res  = await fetch('/api/calendar')
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const evts: any[] = data.events ?? []
          if (!evts.length) { addLine('info', 'No calendar events found'); return }
          addLine('info', `${evts.length} event${evts.length !== 1 ? 's' : ''}:`)
          evts.forEach(e => addLine('output', `  ${e.eventId}  [${e.type}]  ${e.schedule || e.scheduleDisplay || e.scheduledAt?.slice(0, 10)}  ${e.title}`))
        } catch { addLine('error', 'Failed to fetch calendar') }
        finally   { setProcessing(false) }
        return
      }
      addLine('warn', 'Usage: calendar list')
      return
    }

    // ── sync ───────────────────────────────────────────────────────────────────────
    if (base === 'sync') {
      setProcessing(true)
      addLine('info', '⏳ Syncing Hermes data to Mission Control...')
      try {
        const res  = await fetch('/api/hermes/sync', { method: 'POST' })
        const data = await res.json()
        if (data.synced) {
          addLine('ok', `Sync complete — ${data.skillCount} skill${data.skillCount !== 1 ? 's' : ''}, ${data.memoryCount} memor${data.memoryCount !== 1 ? 'ies' : 'y'}`)
          if (data.lastSyncedAt) addLine('output', `  Last synced: ${new Date(data.lastSyncedAt).toLocaleString()}`)
        } else {
          addLine('warn', 'Sync triggered — no update detected within timeout (Hermes may still be running it)')
        }
      } catch { addLine('error', 'Sync request failed') }
      finally   { setProcessing(false) }
      return
    }

    // ── hermes <cmd> — legacy prefix, still supported ──────────────────────────────
    if (base === 'hermes') {
      const hermesCmd = parts.slice(1).join(' ').trim()
      if (!hermesCmd) {
        addLine('warn', 'Usage: hermes <cmd>  (tip: you can also type /<cmd> directly)')
        return
      }
      // Ensure slash prefix for Hermes to interpret as a command
      const withSlash = hermesCmd.startsWith('/') ? hermesCmd : `/${hermesCmd}`
      await runHermesCommand(withSlash)
      return
    }

    // ── Hermes bare-word commands (no / required) ──────────────────────────────────
    // e.g. "status", "usage", "debug", "background <prompt>", etc.
    if (HERMES_BARE_CMDS.has(base)) {
      // Forward with / prefix so Hermes interprets it as a slash command
      await runHermesCommand(`/${stripped}`)
      return
    }

    // ── Any remaining /cmd (slash commands not handled above) → forward to Hermes ──
    // e.g. /status, /usage, /skills, /<skill-name>, etc.
    if (raw.startsWith('/') && !LOCAL_CMDS.has(base)) {
      await runHermesCommand(raw)
      return
    }

    addLine('error', `Unknown command: "${parts[0]}" — type "help" for available commands`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiStep, addLine, addLines, runHermesCommand])

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'url(/bg-terminal.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.08, zIndex: 0 }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, #0d1323 80%)', zIndex: 1 }} />
      <TopAppBar breadcrumb={['Hermes', 'Terminal']} />

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

      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TerminalOutput lines={lines} />
      </div>
      <div style={{ position: 'relative', zIndex: 2 }}>
        <TerminalInput onCommand={executeCommand} disabled={processing} prompt={currentPrompt ?? '▸ HERMES ~$ '} />
      </div>
    </div>
  )
}
