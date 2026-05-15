export type ActivitySeverity = 'error' | 'warn' | 'success' | 'info' | 'muted'

export type ActivityKind =
  | 'skill-sync'
  | 'gateway-start'
  | 'worker-init'
  | 'error'
  | 'warn'
  | 'info'
  | 'raw'

export interface LogLine {
  timestamp: number
  message: string
}

export interface ActivityEvent {
  id: string
  timestamp: number
  kind: ActivityKind
  severity: ActivitySeverity
  summary: string
  detail?: string[]
  count?: number
}

export interface SeverityStyle {
  color: string
  glow: string
}

export function severityStyle(severity: ActivitySeverity): SeverityStyle {
  switch (severity) {
    case 'error':   return { color: '#ffb4ab', glow: 'rgba(255,180,171,0.15)' }
    case 'warn':    return { color: '#ffd599', glow: 'rgba(255,213,153,0.10)' }
    case 'success': return { color: '#5df6e0', glow: 'rgba(93,246,224,0.10)' }
    case 'info':    return { color: '#b8c4ff', glow: 'rgba(184,196,255,0.08)' }
    case 'muted':
    default:        return { color: '#78868b', glow: 'transparent' }
  }
}

const SKILL_LINE = /^\s*[↑↓]\s+\S+\s*\((updated|unchanged|new|user-modified|kept)\)\s*$/
const SKILL_DONE = /^\s*Done:\s+.*bundled\.?\s*$/i
const WORKER_LINE = /^\s*\[worker-launcher\]/
const BANNER_TOP = /^\s*┌─+┐?\s*$/
const BANNER_BOTTOM = /^\s*└─+┘?\s*$/
const BANNER_MID = /Hermes Gateway/i
const ERROR_HINT = /\b(ERROR|Exception|Traceback)\b/
const SLACK_API_ERROR = /^\s*The server responded with:\s*({.*})\s*$/
const SLACK_ERR_FIELD = /'error'\s*:\s*'([^']+)'/
const STACK_FRAME =
  /^(\s+File\s+"|\s+\^|\s+~|\s{2,}|slack_sdk\.errors|[A-Za-z_][\w.]*Error:|\.\.\.<\d+\s+lines>\.\.\.|\)$|\^$)/

function isStackContinuation(line: string): boolean {
  if (!line) return false
  if (STACK_FRAME.test(line)) return true
  if (/^\s*Traceback\b/.test(line)) return true
  if (/^\s*The server responded with:/.test(line)) return true
  // Bare lines that follow a traceback header but aren't obviously something else
  if (/^[A-Za-z_][\w.]*Error\b/.test(line)) return true
  return false
}

function eventId(timestamp: number, summary: string, index: number): string {
  return `${timestamp}-${index}-${summary.slice(0, 24).replace(/\s+/g, '_')}`
}

export function parseActivity(logs: LogLine[]): ActivityEvent[] {
  const events: ActivityEvent[] = []
  let i = 0

  while (i < logs.length) {
    const line = logs[i]
    const msg = line.message ?? ''

    // 1. Gateway startup banner: 3-line ┌── │ ⚕ Hermes Gateway Starting │ └──
    if (BANNER_TOP.test(msg) && i + 1 < logs.length && BANNER_MID.test(logs[i + 1].message)) {
      const detail: string[] = []
      let j = i
      while (j < logs.length && j < i + 8) {
        detail.push(logs[j].message)
        if (BANNER_BOTTOM.test(logs[j].message)) { j++; break }
        j++
      }
      events.push({
        id: eventId(line.timestamp, 'gateway-start', i),
        timestamp: line.timestamp,
        kind: 'gateway-start',
        severity: 'success',
        summary: 'Hermes Gateway started',
        detail,
      })
      i = j
      continue
    }

    // 2. Skill-sync run: consecutive ↑ skill lines, optionally ending in "Done: ...bundled."
    if (SKILL_LINE.test(msg)) {
      const detail: string[] = []
      let doneLine: string | null = null
      let j = i
      while (j < logs.length) {
        const m = logs[j].message
        if (SKILL_LINE.test(m)) {
          detail.push(m)
          j++
          continue
        }
        if (SKILL_DONE.test(m)) {
          doneLine = m.trim()
          detail.push(m)
          j++
          break
        }
        break
      }
      events.push({
        id: eventId(line.timestamp, 'skill-sync', i),
        timestamp: line.timestamp,
        kind: 'skill-sync',
        severity: 'info',
        summary: doneLine ?? `Synced ${detail.length} skills`,
        detail,
        count: detail.length,
      })
      i = j
      continue
    }

    // 3. Worker launcher block
    if (WORKER_LINE.test(msg)) {
      const detail: string[] = []
      let profile: string | null = null
      let j = i
      while (j < logs.length && WORKER_LINE.test(logs[j].message)) {
        detail.push(logs[j].message)
        const pm = logs[j].message.match(/HERMES_PROFILE=([^\s']+)/)
        if (pm) profile = pm[1].replace(/^['"]|['"]$/g, '')
        const rm = logs[j].message.match(/resolve_profile_env\([^)]+\)\s*=\s*'([^']+)'/)
        if (rm && !profile) profile = rm[1]
        j++
      }
      const summary = profile && profile !== 'None'
        ? `Worker launcher initialized (${profile})`
        : 'Worker launcher initialized'
      events.push({
        id: eventId(line.timestamp, 'worker-init', i),
        timestamp: line.timestamp,
        kind: 'worker-init',
        severity: 'info',
        summary,
        detail,
        count: detail.length,
      })
      i = j
      continue
    }

    // 4. Error + traceback: header line + following stack frames (+ optional API error follow-up)
    if (ERROR_HINT.test(msg)) {
      const detail: string[] = [msg]
      let j = i + 1
      let slackErr: string | null = null
      while (j < logs.length) {
        const next = logs[j].message
        // Slack-style "The server responded with: {...}" attaches to the error
        const sm = next.match(SLACK_API_ERROR)
        if (sm) {
          detail.push(next)
          const f = next.match(SLACK_ERR_FIELD)
          if (f) slackErr = f[1]
          j++
          continue
        }
        if (isStackContinuation(next)) {
          detail.push(next)
          j++
          continue
        }
        break
      }

      let summary = msg.trim()
      // Slack send error: prefer the channel/server reason
      if (slackErr && /slack/i.test(msg)) {
        summary = `Slack send failed: ${slackErr}`
      } else if (/Send error/i.test(msg) && slackErr) {
        summary = `Send failed: ${slackErr}`
      } else {
        // Strip leading "ERROR module.name:" prefix for readability
        summary = summary.replace(/^ERROR\s+[\w.]+:\s*/, '')
      }

      events.push({
        id: eventId(line.timestamp, 'error', i),
        timestamp: line.timestamp,
        kind: 'error',
        severity: 'error',
        summary,
        detail: detail.length > 1 ? detail : undefined,
      })
      i = j
      continue
    }

    // 5. Single-line WARN / INFO / OK / HERMES / fallthrough
    if (/\[WARN\]|WARNING/.test(msg)) {
      events.push({
        id: eventId(line.timestamp, 'warn', i),
        timestamp: line.timestamp,
        kind: 'warn',
        severity: 'warn',
        summary: msg.trim(),
      })
      i++
      continue
    }
    if (/\[OK\]|\[SUCCESS\]/.test(msg)) {
      events.push({
        id: eventId(line.timestamp, 'ok', i),
        timestamp: line.timestamp,
        kind: 'info',
        severity: 'success',
        summary: msg.trim(),
      })
      i++
      continue
    }
    if (/\[INFO\]/.test(msg)) {
      events.push({
        id: eventId(line.timestamp, 'info', i),
        timestamp: line.timestamp,
        kind: 'info',
        severity: 'info',
        summary: msg.trim(),
      })
      i++
      continue
    }
    if (/\[HERMES\]|HERMES >/.test(msg)) {
      events.push({
        id: eventId(line.timestamp, 'info', i),
        timestamp: line.timestamp,
        kind: 'info',
        severity: 'info',
        summary: msg.trim(),
      })
      i++
      continue
    }

    events.push({
      id: eventId(line.timestamp, 'raw', i),
      timestamp: line.timestamp,
      kind: 'raw',
      severity: 'muted',
      summary: msg.trim() || '(empty)',
    })
    i++
  }

  return events
}
