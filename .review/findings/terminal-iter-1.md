# Terminal Feature — Code Review (Iter 1)

**Reviewed:** 2026-05-14
**Scope:** `app/terminal/page.tsx`, `components/terminal/TerminalInput.tsx`, `components/terminal/TerminalOutput.tsx`, `app/api/terminal/execute/route.ts`
**Focus:** command injection via `hermesClient.exec` + auth gating of `/api/terminal/execute`

---

## Summary

The terminal forwards user-typed strings through `/api/terminal/execute` to `hermesClient.exec` (POSTs JSON `{command}` to `${dashboardUrl}/api/mc/exec`). The exec path is gated by an allow-list (`CLI_COMMANDS` / `HERMES_COMMANDS`) that matches only the **first token** (`parseBase`); the remainder of the command line is forwarded verbatim to the remote `mc_proxy` for subprocess execution. The remote `mc_proxy.EXEC_WHITELIST` is the real authoritative defense — Mission Control adds a thin client-side filter on top.

Three findings raise the bar from "thin filter" to "broken trust boundary":

1. **`middleware.ts` is fully disabled** (`config.matcher: []`) — every API route, including `/api/terminal/execute`, is **unauthenticated**. Anyone who can reach the Mission Control host can invoke `hermesClient.exec` against the live Hermes dashboard.
2. **`parseBase` only checks the first token** — argument strings are forwarded as a single payload to remote subprocess execution. If `mc_proxy`'s argument parser ever uses `shell=True` semantics, this is full command injection; even with `shell=False`, it permits unrestricted **argument injection** to the `hermes` CLI (e.g. arbitrary `--config-file`, `--profile`, prompt-injection via `background <attacker prompt>`).
3. **No length / character-class limits** on the `command` field before forwarding.

Defense in depth is needed at the Mission Control layer because the comment "match `mc_proxy` EXEC_WHITELIST exactly" is the only thing keeping the two filters in sync — there is no test enforcing it.

---

## CR-01 — `/api/terminal/execute` is unauthenticated (middleware disabled) [FLAGGED]

**Severity:** CRITICAL
**File:** `middleware.ts:1-9`
**Classification:** FLAGGED (auth gating change)

The background note says *"middleware.ts handles auth — verify the execute route is protected."* It is not. The entire middleware is commented out and the matcher is empty:

```ts
// Auth temporarily disabled — restore when Google OAuth is configured
// import { withAuth } from 'next-auth/middleware'
// export default withAuth({ callbacks: { authorized: ({ token }) => !!token }, pages: { signIn: '/auth/signin' } })
// export const config = { matcher: ['/((?!api/auth|auth|_next/static|_next/image|favicon.ico).*)'] }

export function middleware() {}
export const config = { matcher: [] }
```

And the route itself reads the session **only for `senderName`** (display purposes), never enforces it:

```ts
// app/api/terminal/execute/route.ts:99-100
const session    = await getServerSession(authOptions)
const senderName = session?.user?.name ?? session?.user?.email ?? 'Terminal'
```

`session` may be `null` and the request still proceeds. Combined with `hermesClient.exec` being the only direct path to `mc_proxy`, anyone reachable on the MC host can drive arbitrary `hermes <cmd>` subprocess executions on the cluster.

**Fix:** At minimum, hard-fail the route when `session?.user` is absent — do not wait for middleware re-enablement:

```ts
const session = await getServerSession(authOptions)
if (!session?.user) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
}
const senderName = session.user.name ?? session.user.email ?? 'Terminal'
```

Then restore `middleware.ts` (uncomment the `withAuth` block) as the primary control.

---

## CR-02 — Allow-list checks only the first token; full arg string flows to remote subprocess [FLAGGED]

**Severity:** HIGH
**File:** `app/api/terminal/execute/route.ts:74-84, 112-117`
**Classification:** FLAGGED (command-injection-class)

`isAllowed` only validates `parseBase(command)`:

```ts
function parseBase(command: string): string {
  return command.trim().replace(/^\//, '').split(/\s+/)[0].toLowerCase()
}
function isAllowed(command: string): boolean {
  return HERMES_COMMANDS.has(parseBase(command))
}
```

The full `command` string is then forwarded verbatim:

```ts
const output = await hermesClient.exec(command, senderName)
```

which becomes (per `lib/hermesClient.direct.ts:163-178`):

```ts
body: JSON.stringify({ command }),  // → POST {dashboardUrl}/api/mc/exec
```

The remote `mc_proxy` is the only thing standing between a string like `model --config-file=/etc/passwd` (or `model; rm -rf /tmp/x` if it ever uses `shell=True`) and execution. Mission Control should not delegate this entire responsibility.

This also enables **prompt-injection-style abuse via the chat path** for the `background`, `queue`, `steer`, `goal` commands — an attacker who reaches the route can post `/background <attacker prompt overriding system instructions>` and Hermes will spawn a session with that prompt. The allow-list passes because only `background` is checked.

**Fix:**

1. Add per-command argument validators. For CLI commands (`model`, `config`, `cron`, ...), tokenize and enforce a small alphabet (e.g. `/^[A-Za-z0-9._\-=/ ]+$/` plus length cap ≤ 512). Reject `;`, `&`, `|`, `` ` ``, `$(`, `\n`, `\r`, `\0`.
2. Cap `command.length` to a sane limit (e.g. 1024) before any allow-list check:

```ts
if (command.length > 1024) {
  return new Response(JSON.stringify({ error: 'command too long' }), { status: 400 })
}
const SAFE_CMD = /^[\/A-Za-z0-9._\-=:" '@,]+$/
if (!SAFE_CMD.test(command)) {
  return new Response(JSON.stringify({ error: 'command contains disallowed characters' }), { status: 400 })
}
```

3. Add a contract test asserting MC's allow-list is a strict subset of `mc_proxy.EXEC_WHITELIST` (today the only guarantee is a comment).

---

## CR-03 — `/api/mc/exec` HTTP auth is "best effort" via `authHeaders()` [FLAGGED]

**Severity:** HIGH
**File:** `lib/hermesClient.direct.ts:163-178`
**Classification:** FLAGGED (exec/auth)

The direct transport relies on whatever `authHeaders()` returns — likely a shared API key in `.env.local`. There is no per-request signing, no caller identity propagation, and the dashboard URL (cached) is the **only** gate at the network layer once MC's middleware is off (CR-01). Combined with CR-01, an unauthenticated browser request to MC becomes a fully-authenticated request to `mc_proxy`.

**Fix:** This is partially out of scope of this iter, but flag for hardening: include `senderName` (after CR-01 enforces auth) in the signed payload to `mc_proxy` so the remote audit log records *which MC user* ran the command, not just "Mission Control". Today senderName is collected (`route.ts:100`) but the direct exec body (`hermesClient.direct.ts:168`) drops it.

---

## WR-01 — Empty-catch error swallowing in streaming loop [AUTO-SAFE]

**Severity:** WARNING
**File:** `app/terminal/page.tsx:292`
**Classification:** AUTO-SAFE

```ts
} catch { /* skip malformed */ }
```

Malformed SSE events from Hermes are silently dropped — including `event.type === 'error'` events with non-JSON message bodies. The user sees the generic *"no response from Hermes"* line instead of the real failure mode. Useful for security telemetry too: an attacker probing the route would not surface decoding failures anywhere.

**Fix:**

```ts
} catch (e) {
  console.warn('[terminal] malformed SSE frame', { line: part.slice(0, 200), err: e })
}
```

---

## WR-02 — `parseArgs` does not honor escapes inside quotes [AUTO-SAFE]

**Severity:** WARNING
**File:** `app/terminal/page.tsx:154-173`
**Classification:** AUTO-SAFE

```ts
if (inQuote) {
  if (ch === quoteChar) inQuote = false
  else current += ch
}
```

`"a\"b"` is split into `a\` and `b`, not `a"b`. This is purely client-side cosmetic for kanban titles / memory titles (server-side bodies are JSON, not shell), so it is not a security issue — but it produces surprising terminal behaviour. No backslash handling at all.

**Fix:** Either document that quotes don't support escape sequences (rename the file's comment) or implement `\\` and `\"` handling:

```ts
if (inQuote) {
  if (ch === '\\') { current += /* read next */ ; continue }
  if (ch === quoteChar) inQuote = false
  else current += ch
}
```

---

## WR-03 — `extractFlag` can read an own-flag value if no value provided [AUTO-SAFE]

**Severity:** WARNING
**File:** `app/terminal/page.tsx:187-192`
**Classification:** AUTO-SAFE

```ts
const spIdx = args.findIndex(a => a.toLowerCase() === flag)
if (spIdx >= 0 && spIdx < args.length - 1) {
  const val = args[spIdx + 1]
  args.splice(spIdx, 2)
  return val
}
```

`kanban create my-title --assignee --priority high` consumes `--priority` as the assignee value, then leaves a stray `high`. The user gets a task assigned to `"--priority"`. The next call to `extractFlag` for `--priority` no longer finds it.

**Fix:** Reject when the next token looks like a flag:

```ts
const next = args[spIdx + 1]
if (next?.startsWith('--')) return undefined
args.splice(spIdx, 2)
return next
```

---

## WR-04 — `parseInt` without radix [AUTO-SAFE]

**Severity:** WARNING
**File:** `app/terminal/page.tsx:720`
**Classification:** AUTO-SAFE

```ts
const n = parseInt(parts[2] || '20')
```

Missing radix; also accepts negative numbers and floats. `ecs logs -1` produces `?lines=-1` which the API may misinterpret.

**Fix:**

```ts
const raw = parseInt(parts[2] ?? '20', 10)
const n = Number.isFinite(raw) && raw > 0 && raw <= 500 ? raw : 20
```

---

## WR-05 — `statusFlag` query value not URL-encoded [AUTO-SAFE]

**Severity:** WARNING
**File:** `app/terminal/page.tsx:465-468`
**Classification:** AUTO-SAFE

```ts
const statusFlag = parts.find(p => p.startsWith('--status='))?.split('=')[1]
const url = '/api/kanban' + (statusFlag ? `?status=${statusFlag}` : '')
```

A status containing `&` or `#` (e.g. user typo) breaks the URL and silently corrupts subsequent query params. Not exploitable here (same-origin fetch, sanitized server side) but inconsistent with the memory-search path which does encode (`encodeURIComponent(query)` on line 680).

**Fix:**

```ts
const url = '/api/kanban' + (statusFlag ? `?status=${encodeURIComponent(statusFlag)}` : '')
```

---

## IN-01 — `executeCommand` recursion on `tasks` alias may infinite-loop [AUTO-SAFE]

**Severity:** INFO
**File:** `app/terminal/page.tsx:650-655`
**Classification:** AUTO-SAFE

```ts
if (base === 'tasks') {
  const remapped = ['kanban', ...parts.slice(1)].join(' ')
  addLine('info', `(routing to: ${remapped})`)
  await executeCommand(remapped)
  return
}
```

Safe today because `kanban` is a different branch. But if a future refactor renamed `kanban` back to `tasks` or vice-versa, this is a stack overflow. Add a depth guard or rewrite as a string-prefix map.

---

## IN-02 — `removeStatusLine` race when consecutive events arrive [AUTO-SAFE]

**Severity:** INFO
**File:** `app/terminal/page.tsx:213-218, 277-290`
**Classification:** AUTO-SAFE

`removeStatusLine()` is called inside the SSE loop on each event type. The first event nulls `statusLineId.current`, subsequent calls are no-ops — correct. But the React state update is async; in theory a `text_replace` could be inserted *before* the status line is filtered out, producing one frame of "⏳ Sending..." plus the streamed text. Minor UX, not a bug.

---

## IN-03 — Command echo prints raw user input as `prompt` type [AUTO-SAFE]

**Severity:** INFO
**File:** `app/terminal/page.tsx:350`
**Classification:** AUTO-SAFE

```ts
addLine('prompt', raw)
```

`TerminalOutput` renders this with `{line.content}` inside JSX (`TerminalOutput.tsx:73`), so React escapes it — no XSS. Good defense in depth already in place; documenting for completeness. **Do not switch to `dangerouslySetInnerHTML`.**

---

## IN-04 — `HERMES_BARE_CMDS` vs `HERMES_COMMANDS` drift [AUTO-SAFE]

**Severity:** INFO
**File:** `app/terminal/page.tsx:11-22` vs `app/api/terminal/execute/route.ts:50-72`
**Classification:** AUTO-SAFE

Two separately-maintained allow-lists. Client (`HERMES_BARE_CMDS`) and server (`HERMES_COMMANDS`) overlap but are not equal — e.g. `whatsapp`, `login`, `logout`, `uninstall`, `profiles` are server-only. Drift will cause confusing "Command not allowed" errors when client sends a command it considers valid.

**Fix:** Move the canonical list to a shared module (`lib/hermesCommands.ts`) and import on both sides.

---

## Findings Roll-Up

| Severity | Count | Auto-Safe | Flagged |
|---|---|---|---|
| CRITICAL | 1 | 0 | 1 (CR-01) |
| HIGH     | 2 | 0 | 2 (CR-02, CR-03) |
| WARNING  | 5 | 5 | 0 |
| INFO     | 4 | 4 | 0 |

**Blocking for merge:** CR-01 (unauthenticated exec endpoint) and CR-02 (allow-list only checks first token). Either alone is sufficient to flag this iteration.

**Recommended next step:** Land an in-route auth check (CR-01 fix) and an argument validator (CR-02 fix) before exposing `/terminal` to any non-local environment.
