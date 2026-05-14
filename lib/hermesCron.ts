/**
 * Hermes cron client — wraps the `hermes cron` top-level CLI subcommand.
 *
 * Hermes exposes `hermes cron list|create|edit|pause|resume|run|remove`
 * as a real argparse subcommand (registered in hermes-agent's
 * hermes_cli/main.py, implemented in hermes_cli/cron.py).  Each
 * subcommand returns text on stdout and exit code 0 / 1.
 *
 * TRANSPORT ROUTING
 * ─────────────────────────────────────────────────────────────────────
 *   Single-word args (list / pause / resume / run / remove)
 *     → hermesClient.exec('cron …')  →  /api/mc/exec on mc_proxy.
 *
 *   Multi-word args (create, edit — cron schedules, prompts, names)
 *     → hermesClient.chatSend('/cron …')  →  api_server slash dispatcher.
 *
 *   Why split: mc_proxy's exec endpoint whitespace-splits the command
 *   string before forwarding to subprocess (no shlex), so it can't carry
 *   `'0 2 * * *'` as a single arg.  The slash-command dispatcher inside
 *   Hermes uses Python `shlex.split` which honours quoted strings.
 *
 *   The slash handler prints to the REPL stdout, not the chat reply
 *   stream, so we don't parse chatSend output — instead we diff
 *   `cron list` before/after to identify the created/edited job.
 *
 * Both transports auth via `X-Hermes-Key`.  Transient 401s from mc_proxy
 * are auto-retried once (see `withAuthRetry`).
 *
 * Output format (from hermes_cli/cron.py):
 *
 *   list →
 *     ┌──────────────────────…──┐
 *     │     Scheduled Jobs       │
 *     └──────────────────────…──┘
 *
 *       <jobId> [active|paused|completed|disabled]
 *         Name:      …
 *         Schedule:  …
 *         Repeat:    1/∞/n
 *         Next run:  ISO ts
 *         Deliver:   …
 *         Skills:    a, b      (optional)
 *         Last run:  ISO ts (success|failed|running)   (optional)
 *
 *   create →  "Created job: <id>" + Name/Schedule/Skills?/Next run lines
 *   edit   →  "Updated job: <id>" + Name/Schedule/Skills lines
 *   pause/resume/run/remove → "Paused/Resumed/Triggered/Removed job: <name> (<id>)"
 *
 *   Failures → "Failed to <action> job: <error>"  (exit 1)
 *
 * Output (exec path) may include ANSI colour escapes — `stripAnsi`
 * removes them before regex parsing.
 *
 * History (so this routing doesn't get unwound):
 *   - exec for everything → broke on multi-word args (mc_proxy whitespace
 *     splits, no shlex), produced "unrecognized arguments: * * *' 'Pull …"
 *   - chatSend for everything (parsing the reply) → only worked for
 *     creates / edits.  Reply is the agent's paraphrased response, not
 *     the slash handler's stdout, so parsing fails.
 *   - REST /api/cron/jobs → blocked by 401, requires the dashboard
 *     session token which is only injected into the SPA HTML and the SPA
 *     isn't forwarded through mc_proxy.
 *   - Current hybrid: exec for single-word commands, chatSend +
 *     list-diff for multi-word commands.  Both routes work today.
 */
import { hermesClient } from './hermesClient'
import { invalidateHermesEndpointCache } from './hermesEndpoint'

// ── Public types ─────────────────────────────────────────────────────────

export type HermesJobState = 'scheduled' | 'paused' | 'running' | 'completed'

export interface HermesCronJob {
  jobId: string
  name: string
  state: HermesJobState
  schedule: string
  scheduleDisplay?: string
  repeat?: string
  nextRunAt?: string
  lastRunAt?: string
  lastStatus?: 'success' | 'failed' | 'running'
  skills: string[]
  prompt: string
}

export interface CronAddArgs {
  schedule: string
  prompt: string
  name?: string
  skills?: string[]
  repeat?: number
  deliver?: string
}

export interface CronEditArgs {
  schedule?: string
  prompt?: string
  name?: string
  skills?: string[]
  /** Clear all skills (sets skills to []). */
  clearSkills?: boolean
  repeat?: number
  deliver?: string
}

export class HermesCronError extends Error {
  constructor(message: string, public readonly raw?: string) {
    super(message)
    this.name = 'HermesCronError'
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

/**
 * Wrap a Hermes call with one auto-retry on transient 401 / "Unauthorized"
 * errors.  These show up sporadically from mc_proxy — same X-Hermes-Key,
 * same caller, second attempt usually succeeds.  We also invalidate the
 * endpoint cache on the retry so a freshly-deployed ECS task is picked up.
 *
 * Anything other than 401 propagates immediately.
 */
async function withAuthRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Use word boundaries so a benign error message containing "401" as part
    // of a larger number (job count, task ID, port) doesn't trigger a retry.
    if (!/\b401\b|\bUnauthorized\b/i.test(msg)) throw err
    console.warn(`[hermesCron] ${label} got 401 — invalidating endpoint cache and retrying once`)
    invalidateHermesEndpointCache()
    // Brief pause so any in-flight token state on mc_proxy can settle.
    await new Promise(r => setTimeout(r, 250))
    return await fn()
  }
}

async function execCron(args: string): Promise<string> {
  const out = await withAuthRetry(
    () => hermesClient.exec(`cron ${args}`, 'Calendar'),
    `exec cron ${args.split(/\s+/)[0]}`,
  )
  return stripAnsi(out ?? '')
}

/**
 * Send a `/cron …` slash command via chatSend.  Used for `create` and
 * `edit`, which take multi-word args (cron schedules, prompts).
 *
 * Background: mc_proxy's `/api/mc/exec` endpoint splits the command on
 * whitespace before forwarding to the subprocess, so quotes around
 * multi-word args are treated as literal characters and argparse rejects
 * the leftovers with "unrecognized arguments: * * *' 'Pull la…".  The
 * chat path routes through the api_server's slash-command dispatcher,
 * which uses Python `shlex.split` and honours quoted strings.
 *
 * The slash handler prints output to the REPL stdout, not the chat
 * stream, so we don't try to parse the reply — we diff `cron list`
 * before/after to identify the new or edited job.
 */
async function sendCronSlash(slashCmd: string): Promise<void> {
  await withAuthRetry(
    () => hermesClient.chatSend({
      text:                slashCmd,
      senderName:          'Calendar',
      agentId:             'general',
      onPermissionRequest: () => {},
      onTextUpdate:        () => {},
    }),
    `chat ${slashCmd.split(/\s+/)[0]}`,
  )
}

/**
 * Quote a value for inclusion in a slash command.  shlex.split on the
 * Hermes side handles both single- and double-quoted strings; we use
 * double quotes here so we can include literal single quotes (common in
 * English prompts) without escaping.
 */
function slashQuote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function detectFailure(out: string, action: string): string | null {
  const m = out.match(new RegExp(`Failed to ${action}[^:]*:\\s*(.+)`, 'i'))
  if (m) return m[1].trim()
  // Job not found / generic
  const nf = out.match(/Job not found:\s*(.+)/i)
  if (nf) return `job not found: ${nf[1].trim()}`
  return null
}

// ── State + status parsing ───────────────────────────────────────────────

function parseState(stateTag: string, enabledFlag?: string): HermesJobState {
  const s = stateTag.toLowerCase()
  if (s.includes('paused')) return 'paused'
  if (s.includes('completed')) return 'completed'
  if (s.includes('running')) return 'running'
  if (enabledFlag === 'disabled') return 'paused'
  return 'scheduled'
}

function parseLastRunField(value: string): { lastRunAt?: string; lastStatus?: HermesCronJob['lastStatus'] } {
  const m = value.match(/^\s*(.+?)\s*(?:\(([^)]+)\))?\s*$/)
  if (!m) return { lastRunAt: value.trim() }
  const status = m[2]?.trim().toLowerCase()
  const lastStatus: HermesCronJob['lastStatus'] =
    status === 'success' || status === 'failed' || status === 'running' ? status : undefined
  return { lastRunAt: m[1].trim(), lastStatus }
}

// ── List parser ──────────────────────────────────────────────────────────

const ID_LINE_RE = /^\s{0,4}([a-zA-Z0-9_-]{6,})\s+\[([^\]]+)\]/
const FIELD_LINE_RE = /^\s+([A-Z][A-Za-z ]+?):\s+(.*)$/

/**
 * Parse the multi-line "Scheduled Jobs" listing into structured jobs.
 * Each job block starts with `<id> [state]` and continues with indented
 * `Field: value` lines until the next id line or a blank line.
 */
export function parseCronList(out: string): HermesCronJob[] {
  const lines = stripAnsi(out).split(/\r?\n/)
  const jobs: HermesCronJob[] = []
  let cur: Partial<HermesCronJob> | null = null

  const flush = () => {
    if (cur && cur.jobId) {
      jobs.push({
        jobId:           cur.jobId,
        name:            cur.name ?? '',
        state:           cur.state ?? 'scheduled',
        schedule:        cur.schedule ?? '',
        scheduleDisplay: cur.scheduleDisplay ?? cur.schedule,
        repeat:          cur.repeat,
        nextRunAt:       cur.nextRunAt,
        lastRunAt:       cur.lastRunAt,
        lastStatus:      cur.lastStatus,
        skills:          cur.skills ?? [],
        prompt:          cur.prompt ?? '',
      })
    }
    cur = null
  }

  for (const rawLine of lines) {
    // Strip only the box-drawing Unicode block (U+2500-U+257F). The previous
    // `/[─-╿]/g` ranged U+2500-U+2FFC, which also captures arrows, geometric
    // shapes, miscellaneous technical, and CJK radicals — way wider than
    // intended even if today's Hermes output doesn't include those.
    const line = rawLine.replace(/[─-╿]/g, '')
    if (!line.trim()) { flush(); continue }
    if (/^\s*Scheduled Jobs\s*$/i.test(line)) continue
    if (/^\s*No (active|scheduled) jobs/i.test(line)) continue

    const id = line.match(ID_LINE_RE)
    if (id) {
      flush()
      cur = { jobId: id[1], state: parseState(id[2]) }
      continue
    }

    if (!cur) continue
    const fm = line.match(FIELD_LINE_RE)
    if (!fm) continue
    const key = fm[1].trim().toLowerCase()
    const value = fm[2].trim()

    switch (key) {
      case 'name':      cur.name = value; break
      case 'schedule':  cur.schedule = value; cur.scheduleDisplay = value; break
      case 'repeat':    cur.repeat = value; break
      case 'next run':  cur.nextRunAt = value; break
      case 'last run': {
        const { lastRunAt, lastStatus } = parseLastRunField(value)
        cur.lastRunAt = lastRunAt
        cur.lastStatus = lastStatus
        break
      }
      case 'skills':
        cur.skills = value && value.toLowerCase() !== 'none'
          ? value.split(',').map(s => s.trim()).filter(Boolean)
          : []
        break
      case 'prompt':    cur.prompt = value; break
      case 'deliver':   /* informational only */ break
      case 'script':    /* informational only */ break
    }
  }
  flush()
  return jobs
}

// ── Public API ───────────────────────────────────────────────────────────

export async function cronList(includeDisabled = true): Promise<HermesCronJob[]> {
  const out = await execCron(includeDisabled ? 'list --all' : 'list')
  return parseCronList(out)
}

export async function cronAdd(args: CronAddArgs): Promise<HermesCronJob> {
  // Route through chatSend('/cron add ...') because mc_proxy's exec
  // endpoint whitespace-splits the command and breaks the multi-word
  // schedule + prompt args.  Slash dispatcher uses shlex.split which
  // handles quotes properly.
  const parts: string[] = ['/cron', 'add', slashQuote(args.schedule), slashQuote(args.prompt)]
  if (args.name)    parts.push('--name',    slashQuote(args.name))
  if (args.deliver) parts.push('--deliver', slashQuote(args.deliver))
  if (typeof args.repeat === 'number') parts.push('--repeat', String(args.repeat))
  for (const s of args.skills ?? []) parts.push('--skill', slashQuote(s))

  // Snapshot the job list before so we can identify the new entry.
  const before = await cronList(true).catch(() => [] as HermesCronJob[])
  const beforeIds = new Set(before.map(j => j.jobId))

  await sendCronSlash(parts.join(' '))

  // Re-list to find the new job.
  const after = await cronList(true)
  const newJobs = after.filter(j => !beforeIds.has(j.jobId))

  if (newJobs.length === 1) return newJobs[0]
  if (newJobs.length > 1) {
    // Multiple new jobs (rare).  Disambiguate by name, then by
    // prompt+schedule.  Pure exact match — Hermes ids are fixed-length
    // hex so prefix matching would produce false positives if ids share
    // characters.
    const matched = newJobs.find(j =>
      (args.name && j.name === args.name) ||
      (j.schedule === args.schedule && j.prompt === args.prompt),
    )
    if (matched) return matched
    return newJobs[0]  // best effort
  }

  // No new job — slash command didn't take.
  throw new HermesCronError(
    `create: Hermes did not create a new job. Slash command sent: "${parts.join(' ').slice(0, 200)}".`,
    '',
  )
}

export async function cronEdit(jobId: string, updates: CronEditArgs): Promise<HermesCronJob> {
  // Route through chatSend('/cron edit ...') — same reason as cronAdd:
  // mc_proxy whitespace-splits the exec command, mangling multi-word args.
  const parts: string[] = ['/cron', 'edit', jobId]
  if (updates.schedule !== undefined) parts.push('--schedule', slashQuote(updates.schedule))
  if (updates.prompt   !== undefined) parts.push('--prompt',   slashQuote(updates.prompt))
  if (updates.name     !== undefined) parts.push('--name',     slashQuote(updates.name))
  if (updates.deliver  !== undefined) parts.push('--deliver',  slashQuote(updates.deliver))
  if (typeof updates.repeat === 'number') parts.push('--repeat', String(updates.repeat))
  if (updates.clearSkills) parts.push('--clear-skills')
  else if (updates.skills !== undefined) {
    if (updates.skills.length === 0) parts.push('--clear-skills')
    else for (const s of updates.skills) parts.push('--skill', slashQuote(s))
  }

  await sendCronSlash(parts.join(' '))

  // Re-list to read back the updated state.  Exact id match only —
  // prefix matching would cross-pollute jobs whose ids share characters.
  const list = await cronList(true)
  const job = list.find(j => j.jobId === jobId)
  if (!job) {
    throw new HermesCronError(
      `edit: job ${jobId} not found in cron list after edit. Slash command: "${parts.join(' ').slice(0, 200)}".`,
      '',
    )
  }
  return job
}

export interface CronRemoveDiagnostic {
  jobId: string
  preRemoveListIds: string[]
  removeOutput: string
  postRemoveListIds: string[]
  detectedFailure: string | null
  stillPresentAfter: boolean
}

let _lastRemoveDiag: CronRemoveDiagnostic | null = null
export function lastCronRemoveDiagnostic(): CronRemoveDiagnostic | null {
  return _lastRemoveDiag
}

export async function cronRemove(jobId: string): Promise<void> {
  // Snapshot the list BEFORE remove so we can correlate.
  const before = await cronList(true).catch(() => [] as HermesCronJob[])
  const preIds = before.map(j => j.jobId)
  console.log(`[cronRemove] target=${jobId}  preList=[${preIds.join(',')}]  match=${preIds.includes(jobId)}`)

  const out = await execCron(`remove ${jobId}`)
  const fail = detectFailure(out, 'remove')
  console.log(`[cronRemove] target=${jobId}  raw="${out.replace(/\s+/g, ' ').slice(0, 300)}"  fail=${fail ?? 'null'}`)

  // Re-list to verify.
  const after = await cronList(true).catch(() => [] as HermesCronJob[])
  const postIds = after.map(j => j.jobId)
  // Exact id match only.  Hermes ids are 12-char hex (`uuid.uuid4().hex[:12]`)
  // and prefix matching would produce false positives on a busy host.
  const stillThere = postIds.includes(jobId)
  console.log(`[cronRemove] target=${jobId}  postList=[${postIds.join(',')}]  stillThere=${stillThere}`)

  _lastRemoveDiag = {
    jobId,
    preRemoveListIds: preIds,
    removeOutput: out,
    postRemoveListIds: postIds,
    detectedFailure: fail,
    stillPresentAfter: stillThere,
  }

  if (stillThere) {
    throw new HermesCronError(
      `Hermes did not remove job ${jobId}. ` +
      (fail ? `CLI said: "${fail}". ` : `CLI output: "${out.replace(/\s+/g, ' ').slice(0, 200)}". `) +
      `Job still present in cron list.`,
      out,
    )
  }

  // Not present after — even if CLI said "failed", the goal is achieved.
  if (fail) {
    console.warn(`[cronRemove] CLI said "${fail}" but job ${jobId} is absent post-remove — treating as success.`)
  }
}

export async function cronPause(jobId: string): Promise<void> {
  const out = await execCron(`pause ${jobId}`)
  const fail = detectFailure(out, 'pause')
  if (fail) throw new HermesCronError(`pause: ${fail}`, out)
  if (!/Paused job:/.test(out)) throw new HermesCronError(`pause: unexpected output`, out)
}

export async function cronResume(jobId: string): Promise<void> {
  const out = await execCron(`resume ${jobId}`)
  const fail = detectFailure(out, 'resume')
  if (fail) throw new HermesCronError(`resume: ${fail}`, out)
  if (!/Resumed job:/.test(out)) throw new HermesCronError(`resume: unexpected output`, out)
}

export async function cronRun(jobId: string): Promise<void> {
  const out = await execCron(`run ${jobId}`)
  const fail = detectFailure(out, 'run')
  if (fail) throw new HermesCronError(`run: ${fail}`, out)
  if (!/Triggered job:/.test(out)) throw new HermesCronError(`run: unexpected output`, out)
}
