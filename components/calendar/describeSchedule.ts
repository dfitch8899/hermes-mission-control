/**
 * Client-side preview of how Hermes will interpret a schedule string.
 *
 * Mirrors hermes-agent/cron/jobs.py:parse_schedule for the four supported
 * formats:
 *   - 5-field cron        ("0 9 * * *")
 *   - Recurring interval  ("every 30m", "every 2h")
 *   - One-shot duration   ("30m", "2h", "1d")
 *   - ISO timestamp       ("2026-06-01T14:00")
 *
 * Returns a short human-readable string, or '' if the schedule is unparseable.
 * Used only for the form preview — never sent over the wire (Hermes does its
 * own canonical parsing).
 */
const DURATION_RE = /^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i

function parseDurationMinutes(s: string): number | null {
  const m = s.trim().match(DURATION_RE)
  if (!m) return null
  const value = parseInt(m[1], 10)
  const unit = m[2][0].toLowerCase()
  const mult = unit === 'm' ? 1 : unit === 'h' ? 60 : 1440
  return value * mult
}

function describeMinutes(min: number): string {
  if (min % 1440 === 0) return `${min / 1440}d`
  if (min % 60 === 0)   return `${min / 60}h`
  return `${min}m`
}

function describeCronField(min: string, hour: string, dom: string, month: string, dow: string): string {
  if (min === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') return 'Every minute'
  if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`
  if (dom === '*' && month === '*' && dow === '*') {
    if (min === '0' && hour !== '*') return `Every day at ${hour.padStart(2, '0')}:00 UTC`
    if (min !== '*' && hour !== '*') return `Every day at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`
  }
  if (dow !== '*') {
    const days: Record<string, string> = {
      '0': 'Sunday', '1': 'Monday', '2': 'Tuesday', '3': 'Wednesday',
      '4': 'Thursday', '5': 'Friday', '6': 'Saturday',
      MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
      FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
    }
    const dayName = days[dow.toUpperCase()] || dow
    const hh = hour === '*' ? '00' : hour.padStart(2, '0')
    const mm = min === '*' ? '00' : min.padStart(2, '0')
    return `Every ${dayName} at ${hh}:${mm} UTC`
  }
  return `${min} ${hour} ${dom} ${month} ${dow}`
}

export function describeSchedule(raw: string): string {
  const s = raw.trim()
  if (!s) return ''

  // "every X" → recurring interval
  if (/^every\s+/i.test(s)) {
    const rest = s.slice(6).trim()
    const min = parseDurationMinutes(rest)
    if (min === null) return ''
    return `Every ${describeMinutes(min)}`
  }

  // 5-field cron
  const parts = s.split(/\s+/)
  if (parts.length === 5 && parts.every(p => /^[\d*\-,/A-Z]+$/i.test(p))) {
    return describeCronField(parts[0], parts[1], parts[2], parts[3], parts[4])
  }

  // ISO timestamp
  if (s.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) return `Once at ${d.toLocaleString()}`
  }

  // Bare duration → one-shot
  const dur = parseDurationMinutes(s)
  if (dur !== null) return `Once in ${describeMinutes(dur)}`

  return ''
}
