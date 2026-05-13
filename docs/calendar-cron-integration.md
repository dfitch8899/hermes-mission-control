# Calendar ↔ Hermes Cron Integration

Mission Control's `/calendar` page is a thin UI over Hermes's built-in
cron job system.  Hermes is the source of truth — MC just adds a
DynamoDB cache layer for fast reads and a tombstone mechanism for
delete-resilience.

This doc captures the non-obvious routing decisions so they don't get
accidentally unwound.

## Architecture at a glance

```
   /calendar page
        │
        ▼
   /api/calendar/sync      ─→ cronList()          ─→ /api/mc/exec   (Hermes mc_proxy)
   /api/calendar           POST → cronAdd()       ─→ /api/mc/chat   (Hermes api_server)
   /api/calendar/[id]      PUT  → cronEdit()      ─→ /api/mc/chat
                           DELETE → cronRemove()  ─→ /api/mc/exec
                                  + cronPause()   ─→ /api/mc/exec      (fallback)
                                  + DDB tombstone                       (UI hide)
   /api/calendar/[id]/run    → cronRun()    ─→ /api/mc/exec
   /api/calendar/[id]/pause  → cronPause()  ─→ /api/mc/exec
   /api/calendar/[id]/resume → cronResume() ─→ /api/mc/exec

   DynamoDB table: hermes-calendar          (cache + tombstones + markers)
```

## Why two transports (exec + chat)

`lib/hermesCron.ts` uses **both** `hermesClient.exec` and
`hermesClient.chatSend`, and the choice per command is deliberate.

- **`mc_proxy` whitespace-splits** the body of `POST /api/mc/exec`
  before forwarding to a `hermes` subprocess.  It does **not** call
  `shlex.split`, so quotes in the command body are treated as literal
  characters.  Sending `cron create '0 2 * * *' 'Run job'` results in
  argparse seeing `['cron', 'create', "'0", '2', '*', '*', "*'",
  "'Run", 'job\'']` and rejecting the leftovers with
  `unrecognized arguments: * * *' 'Run job'`.

- The **slash-command dispatcher** inside Hermes
  (`hermes_cli/cli.py:_handle_cron_command`) uses Python's
  `shlex.split`, which honours quoted strings.  So multi-word args are
  safe through `chatSend('/cron …')`.

| Command  | Args contain whitespace? | Route                             |
|----------|--------------------------|-----------------------------------|
| `list`   | No                       | `exec('cron list --all')`         |
| `create` | **Yes** (schedule, prompt) | `chatSend('/cron add "..." "..."')` |
| `edit`   | **Yes** (schedule, prompt) | `chatSend('/cron edit <id> --schedule "..." --prompt "..."')` |
| `pause`  | No                       | `exec('cron pause <id>')`         |
| `resume` | No                       | `exec('cron resume <id>')`        |
| `run`    | No                       | `exec('cron run <id>')`           |
| `remove` | No                       | `exec('cron remove <id>')`        |

The chat-routed commands don't parse the chat reply — that reply is
the agent's paraphrased response, not the slash handler's stdout.
Instead `cronAdd` / `cronEdit` snapshot `cron list` before, send the
slash command, then re-list and identify the new/changed job by diff.

## DynamoDB schema (cache + UI metadata)

The `hermes-calendar` table is keyed on `eventId` (string).  For Hermes
jobs we use Hermes's `job_id` directly (12-char hex).  For calendar
markers (MC-only date entries, no Hermes job) we mint `cal-<8 chars>`.

Fields owned by Hermes (refreshed on every sync):
`schedule`, `scheduleDisplay`, `prompt`, `skills`, `state`,
`nextRun`, `lastRun`, `lastRunStatus`.

Fields owned by MC:
`title`, `description`, `createdBy`, `scheduledAt`, `type`,
`tombstoned`, `tombstonedAt`.

### Tombstones

`hermes cron list` doesn't print the prompt, so synced rows always
have `prompt=""` in DDB.  We **cannot** use empty-prompt as the
calendar-marker signal — that's why `isCalendarMarker` checks the
eventId prefix (`cal-*`) instead.

When delete is requested:

1. `cronRemove(id)` — best path, removes the Hermes job entirely.
2. If Hermes refuses, fall back to `cronPause(id)` so the scheduler
   skips it (`get_due_jobs()` filters `enabled !== true`) — **the job
   will not fire**.
3. If pause succeeds, write the DDB row with `tombstoned: true`.
   Sync hides tombstoned rows from the UI and retries `cronRemove` on
   every sync pass; when Hermes finally lets go, the tombstone is
   cleared automatically.
4. If both remove and pause fail, surface a real 502 — the user needs
   to know the job may still fire.

## Sync pipeline (`POST /api/calendar/sync`)

1. `cronList(true)` → Hermes jobs.
2. Scan DDB rows.
3. For each Hermes job whose matching DDB row is tombstoned:
   retry `cronRemove`.  On success, delete the DDB row.  On failure,
   leave the tombstone and skip the row (UI never sees it).
4. For every other Hermes job, upsert into DDB.  When merging, prefer
   the existing DDB `prompt` field over Hermes's empty one.
5. For each DDB row that has no matching Hermes job:
   - `cal-*` markers → keep.
   - tombstoned → delete (Hermes already let go).
   - everything else → delete (stale).

## Known limitations

- **Terminal-created cron jobs have no prompt in MC.**  Until they're
  manually edited from MC's calendar UI (which re-saves the prompt via
  `cronEdit`), the DDB row stays at `prompt=""`.  This doesn't break
  any flow today but it does make the UI show a blank prompt.

- **Transient 401s.**  `mc_proxy` sometimes rejects the first request
  after a quiet period with `HTTP 401 — Unauthorized` and accepts the
  same `X-Hermes-Key` on retry.  `withAuthRetry` in
  `lib/hermesCron.ts` retries once with a 250 ms pause and an
  endpoint-cache invalidation.

- **Calendar-form prompts route through the user's `general` chat
  session.**  Slash commands sent via `chatSend` are persisted in
  Hermes's session store and may appear in the user's chat history.
  No way to suppress this without an api_server change.

## Long-term Hermes-side improvements

These would let us simplify MC code if/when they happen on the Hermes
side.  Filed here for tracking.

1. **`mc_proxy` should use `shlex.split`** before invoking the
   subprocess.  That alone lets every cron operation go through
   `/api/mc/exec` and removes the chat-path workaround entirely.

2. **Add a `--json` flag to `hermes cron list / create / edit`.**
   Removes our text-parsing layer; we'd just `JSON.parse(stdout)`.

3. **Include the prompt in `hermes cron list` output** (or add a
   `hermes cron show <id>` subcommand).  Lets us populate prompts
   for jobs created outside MC.

4. **Add `cron` routes to the dashboard's `_PUBLIC_API_PATHS` bypass
   list**, or have `mc_proxy` add the session bearer token when
   forwarding `/api/cron/jobs`.  Either would let MC use the JSON REST
   surface and skip the CLI layer entirely.
