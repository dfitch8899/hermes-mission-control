# Hermes Profile Sync — Bridging MC Agents to Hermes Profiles

> **STATUS: LIVE (Hermes task def rev ≥ 51).** Bridge endpoints deployed,
> end-to-end BANANA test passes — selecting an agent in MC and sending a
> chat causes Hermes to respond using that agent's systemPrompt. See the
> "Live verification" section at the bottom.

## Why this exists

Mission Control's `/agents` page lets users define agents with rich
fields (systemPrompt, orchestratorModel, workerModel, icon, color, …).
Those definitions live in MC's DynamoDB `hermes-agents` table.

Hermes — the agent runtime — has its own per-profile config files at
`/opt/data/profiles/<name>/`:

| File | What |
|---|---|
| `SOUL.md` | The system prompt Hermes prepends to every turn |
| `config.yaml` | Model selection (e.g. `gpt-5.4`), orchestration policy |
| `.env` | Provider API keys |

Hermes built-in profiles `default / coding / general / marketing /
research` already exist with their own SOUL.md and model config. The
kanban plugin's assignee dropdown reads from `GET /api/plugins/kanban/
assignees`, which enumerates these profiles directly from disk.

**Without sync, the two systems drift.** An MC user edits the `coding`
agent's systemPrompt to "always reply BANANA" expecting Hermes to obey;
Hermes ignores it because Hermes reads `SOUL.md`, not MC's DDB. This
was empirically confirmed: a chat with `agentId: "coding"` and a
BANANA-sentinel systemPrompt returned `"4"` to a math question.

## What MC ships today (this commit)

A best-effort sync layer in `lib/hermesProfileSync.ts`:

- `syncCreateProfile(agentId)` → `POST /api/profiles` (clone_from_default)
- `syncAgentSoul(agentId, prompt)` → `PUT /api/profiles/{name}/soul`
- `syncDeleteProfile(agentId)` → `DELETE /api/profiles/{name}`
- `syncAgent({agentId, systemPrompt})` → create-if-missing + soul update
- `probeProfileSync()` → reachability check (used by the banner)

Wired into MC's agent CRUD:

- `POST   /api/agents`               → `syncAgent(...)`
- `PATCH  /api/agents/{id}`          → `syncAgent(...)` when systemPrompt changes
- `DELETE /api/agents/{id}`          → `syncDeleteProfile(id)`
- `POST   /api/agents/{id}/reset`    → `syncAgent(...)` with canonical prompt

These calls are **fire-and-forget**: they never throw back into the
CRUD path. If Hermes is unreachable or auth-blocked, MC continues to
work as a metadata catalog and surfaces an honest banner on the
`/agents` page.

A new MC route `GET /api/hermes/profile-sync/status` returns the live
reachability:

```jsonc
// reachable:
{ "ok": true,  "status": "reachable",         "httpStatus": 200 }
// auth-blocked (today):
{ "ok": false, "status": "auth_blocked",      "httpStatus": 401,
  "detail": "mc_proxy.py does not yet allowlist /api/profiles/* under X-Hermes-Key" }
// HERMES_TRANSPORT != direct:
{ "ok": false, "status": "transport_disabled" }
// network failure:
{ "ok": false, "status": "network_error",     "detail": "..." }
```

The `/agents` page renders a top banner reflecting this.

## What shipped on the Hermes side (rev 51)

The Hermes container's `patches/mc_proxy.py` got a new endpoint:

```
GET|PUT /api/mc/profile-soul/{name}
```

This handler:

1. Resolves `<name>` to its on-disk profile path by invoking
   `hermes profile show <name>` and parsing the `Path:` line. This
   handles the special case where `default` lives at `HERMES_HOME`
   itself (`/opt/data/SOUL.md`), not `/opt/data/profiles/default/`.
2. On `GET`: returns `{name, content}` with the current SOUL.md content.
3. On `PUT {content}`: writes the body to `<profile_path>/SOUL.md`.
4. Auth: the existing X-Hermes-Key check at the top of `handle()`
   already gates this — no new auth scheme needed.
5. Name validation: only `[a-z0-9_-]+` (no path traversal).

The dashboard's `/api/profiles/*` endpoints are intentionally NOT bridged —
they require a session cookie. Going through the filesystem directly is
both simpler and avoids the dashboard's session-auth wall entirely.

Profile **create/delete** piggy-back on the existing `/api/mc/exec`
endpoint via the `hermes profile create/delete` CLI subcommands which
were already in `EXEC_WHITELIST`.

### Why the dashboard route was abandoned

Original plan was to allowlist `/api/profiles/*` in mc_proxy and use
the dashboard's REST API. That turned out impossible: the dashboard's
HTTPBearer-style middleware doesn't accept `X-Hermes-Key`, and giving
MC a dashboard session cookie was a much bigger surface change.
Writing the SOUL.md file directly is functionally identical and ~25
lines of Python.

### MC chat → Hermes SOUL bridging strategy (LIVE)

Hermes hot-reloads SOUL.md on every chat message (verified empirically),
but only the SOUL of the **active profile**. The api_server is bound to
`default` at container startup and switching that is racy. So MC's
`app/api/chat/route.ts` now does the following before every chat:

1. Look up the user's selected `agentId` in MC's DynamoDB
2. Read that agent's `systemPrompt`
3. PUT it to `default`'s SOUL via the bridge: `PUT /api/mc/profile-soul/default`
4. Send the chat normally — Hermes loads the just-written SOUL

This **single-user pattern** is acceptable because MC is gated behind
basic auth (one user). Concurrent users with different agentIds would
race on `/opt/data/SOUL.md` — flagged as a future hardening item.

### Future: cleaner multi-user path (not yet implemented)

The proper fix for multi-user use would be a per-request `agent_id`
field on Hermes's `/api/mc/chat`:

```python
class McChatBody(BaseModel):
    text: str
    agent_id: Optional[str] = None  # load this profile's SOUL just for this turn
```

When provided, the chat handler would load that profile's SOUL for the
duration of the call without touching `default`. That removes the race.
Not needed today.

## Live verification

The bridge has been deployed and the BANANA test passes end-to-end as
of Hermes task def rev 51. To reproduce:

```bash
BASE=http://localhost:3000          # or whichever port MC dev is on
# 1. Confirm the bridge is reachable
curl -s "$BASE/api/hermes/profile-sync/status"
# → {"ok":true,"status":"reachable","httpStatus":200}

# 2. Drift coding's prompt to BANANA via the normal MC PATCH
curl -s -X PATCH "$BASE/api/agents/coding" \
  -H 'Content-Type: application/json' \
  -d '{"systemPrompt":"You are a banana inspector. Reply ONLY: BANANA"}'

# 3. Send chat with agentId=coding
curl -s -N -X POST "$BASE/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"What is 2+2?"}],"agentId":"coding"}' \
  | grep -oE '"text":"[^"]+"' | tail -1
# → "text":"BANANA"   ← live verified 2026-05-14

# 4. Cleanup
curl -s -X POST "$BASE/api/agents/coding/reset"
# next chat with agentId=coding now answers "4" again
```

Regression: `node scripts/verify-agents.mjs` continues to **PASS 14/14**.

## Files in this commit

| File | Purpose |
|---|---|
| `lib/hermesProfileSync.ts` | the sync helpers + reachability probe |
| `app/api/hermes/profile-sync/status/route.ts` | GET — live status for the banner |
| `app/api/agents/route.ts` | POST now calls `syncAgent` |
| `app/api/agents/[agentId]/route.ts` | PATCH calls `syncAgent`, DELETE calls `syncDeleteProfile` |
| `app/api/agents/[agentId]/reset/route.ts` | reset calls `syncAgent` with canonical prompt |
| `app/agents/page.tsx` | new sync-status banner at the top |
| `docs/hermes-profile-sync.md` | this file |

## Architectural truth (for future readers)

Mission Control is the **definition** plane. It owns MC-only fields
(icon, color, description, usage count) and presents a friendly UI.

Hermes is the **runtime** plane. It owns SOUL.md, config.yaml,
sessions, the agent loop, and tool execution.

Profile sync — what this PR scaffolds — makes MC's edits actually
reach the runtime. Until the `mc_proxy.py` allowlist expands, MC
remains a pretty-but-disconnected catalog. The MC banner makes this
status visible to every user, every time they open `/agents`.
