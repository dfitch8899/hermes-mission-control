# Mission Control — Agent System Verification

This doc captures how to verify the Mission Control agent system end-to-end after
the deep-dive pass that added: model dropdowns with a `Custom…` escape hatch,
"Reset to defaults" for built-ins, Duplicate-agent, the "used by N tasks" badge,
and live agent color/icon on the (orphaned) native kanban components.

---

## A. Reality check: where the kanban UI actually lives

**The active `/kanban` page in MC does NOT render the React components in
`components/kanban/TaskCard.tsx` / `TaskDrawer.tsx` / `KanbanColumn.tsx`.**

`app/kanban/page.tsx` renders `HermesNativeKanbanHost`, which downloads and
mounts a plugin bundle from the Hermes dashboard via the catch-all proxy:

```
GET /api/hermes/dashboard-plugins/kanban/dist/index.js
GET /api/hermes/dashboard-plugins/kanban/dist/style.css
```

That bundle is built and served by the Hermes repo. Its plain `<select>`
assignee dropdown (the "visible assignee editor" from commit `d0c5911`)
is part of that bundle, not of MC.

So:

- **The data contract is owned by MC** — `/api/agents` (list/CRUD/seed/reset/usage)
  and `/api/kanban/*` (with `assignee` field). The Hermes plugin must call these
  to honor MC agents. The verification script (`scripts/verify-agents.sh`)
  covers this contract.
- **The kanban *visual* surfaces** (task card chip color/icon, drawer header
  chip, agent-filter chip row) belong to the Hermes plugin source. Adding those
  features end-to-end requires a change in the Hermes repo, not here. The
  orphaned MC native components in this repo have been wired to the same live
  agent list defensively, so if anyone re-mounts them they Just Work.

If you want the kanban plugin to surface custom-agent colors/icons or an
agent filter, that work needs to land in the Hermes plugin source.

---

## B. API smoke test (automated)

`scripts/verify-agents.sh` exercises the full agent + kanban data contract.
Run it after `npm run dev`:

```bash
npm run dev               # in one terminal
bash scripts/verify-agents.sh   # in another
```

The script runs 13 checks and prints `PASS: 13/13` on success. Override the
base URL with `BASE=http://localhost:3001 bash scripts/verify-agents.sh`.

What it covers:

| # | Check |
|---|-------|
| 1 | `GET /api/agents` lists ≥ 4 agents (built-ins seeded on first hit) |
| 2 | `POST /api/agents/seed` is idempotent — no duplicate built-ins |
| 3 | `POST /api/agents/seed?force=1` refreshes built-in `coding` model |
| 4 | `POST /api/agents` creates a custom agent and returns its agentId |
| 5 | `PATCH /api/agents/{id}` updates fields (systemPrompt round-trip) |
| 6 | `DELETE /api/agents/general` returns 403 (built-in protected) |
| 7 | `POST /api/agents/{custom}/reset` returns 403 (custom is non-resettable) |
| 8 | `POST /api/agents/coding/reset` restores the canonical systemPrompt |
| 9 | `POST /api/kanban` accepts and persists a custom `assignee` |
| 10 | `PATCH /api/kanban/{taskId}` with `{assignee:"coding"}` reassigns |
| 11 | `GET /api/kanban?assignee=…` filters correctly (in/out) |
| 12 | `GET /api/agents/usage` counts the test task under its assignee |
| 13 | `DELETE /api/agents/{custom}` succeeds |

The script cleans up its test task and test agent on exit.

---

## C. UI walkthrough (manual)

Have `npm run dev` running, then in the browser:

### C.1 Agents page

1. Navigate to **`/agents`**. You should see at least the 4 built-in agents:
   `General` ✨, `Coding` 💻, `Marketing` 📢, `Deep Research` 🔬.
2. Click **`+ New Agent`** (top right).
3. **Verify the model fields are now `<select>` dropdowns**, not free-text
   inputs. Open one — you should see the 16 curated MODEL_OPTIONS plus a
   `Custom…` entry at the bottom.
4. Pick **`gpt-4o`** for orchestrator, **`gpt-4o-mini`** for worker. Pick an
   icon like 🚀, a pink color, set a name and a system prompt.
5. Click **Save Agent**. The new agent appears in the grid.
6. Re-open it for editing. Pick **`Custom…`** in one of the model dropdowns.
   A text input should appear below the select. Type `gpt-5.6-preview`. Save.
7. Re-open it again. The dropdown should show `Custom…` selected and the text
   input should be pre-filled with `gpt-5.6-preview`. The card on the grid
   shows the custom string.

### C.2 Duplicate

8. On the `Coding` card, click **Duplicate**. The editor opens with the title
   "Duplicate Agent", `name = "Coding Copy"`, and the built-in lock icon is
   gone. Click **Create Agent**. A new custom card appears in the grid.

### C.3 Reset to defaults

9. Click **Edit** on a built-in (e.g., `Coding`). The editor title is "Edit
   Agent". Change the system prompt to something obviously different. Save.
10. Re-open the same built-in. You'll see a secondary **"Reset to defaults"**
    button below Save. Click it, confirm. The prompt reverts to the canonical
    "You are a senior software engineer…" text. (This is also covered by
    smoke check #8.)

### C.4 Usage badge & delete confirmation

11. In another tab, hit `/kanban` and create or reassign a task to your custom
    agent from step 5.
12. Return to `/agents` and reload. The card for that custom agent should show
    a small cyan badge: **"1 active task"** (or N).
13. Click **Delete** on that agent. The confirm dialog should mention the count:
    *"…It's assigned to 1 open task — they will fall back to the generic
    icon/color."* Cancel.

### C.5 Built-ins cannot be deleted

14. Built-in cards (Lock icon) show no Delete button. Hitting
    `DELETE /api/agents/general` directly returns 403 (covered by smoke
    check #6).

---

## D. Quick reference — files touched

| File | Change |
|---|---|
| `types/agent.ts` | (no change) — already defines MODEL_OPTIONS, BUILTIN_AGENTS |
| `components/agents/AgentEditor.tsx` | model dropdown + Custom escape hatch; Duplicate template mode; Reset-to-defaults button |
| `components/agents/AgentCard.tsx` | Duplicate button; usage-count badge |
| `app/agents/page.tsx` | loads /api/agents/usage; `openDuplicate` handler; stronger delete confirmation; cache invalidation |
| `app/api/agents/[agentId]/reset/route.ts` | **new** — POST restores built-in from BUILTIN_AGENTS |
| `app/api/agents/usage/route.ts` | **new** — GET returns open-task counts grouped by assignee |
| `lib/agents-client.ts` | **new** — shared client-side cache for `/api/agents` |
| `components/kanban/TaskCard.tsx` | defensive — reads live agent icon/color via `lookupAgent` |
| `components/kanban/TaskDrawer.tsx` | defensive — uses `fetchAgents` shared cache; chip shows live name/icon/color |
| `scripts/verify-agents.sh` | **new** — 13-check smoke test |

---

## E. Out of scope (next-step candidates)

1. **Kanban plugin: surface custom agent colors/icons on task cards.**
   The plugin bundle needs to fetch `/api/agents` and render `agent.icon` /
   `agent.color` for the assignee chip. Change goes in the Hermes repo.
2. **Kanban plugin: agent filter chip row.** Same repo. The MC API already
   supports `GET /api/kanban?assignee=<id>`, so wiring is server-ready.
3. **"Test agent" button.** Hard from MC alone — would need a Hermes endpoint
   that accepts an arbitrary agent config and runs one turn against it. Worth
   doing in the Hermes repo as `POST /agents/test`.
4. **Server-side validation of `orchestratorModel`/`workerModel`.** Currently
   permissive — any string is stored. The plugin/Hermes is the actual consumer
   that resolves the string to a backend; if you want a hard allowlist, add
   it in `app/api/agents/route.ts` POST and `[agentId]/route.ts` PATCH.
5. **Usage endpoint GSI.** Today it Scans the kanban table. Fine at current
   scale; switch to a GSI on `assignee` if/when the table is large enough to
   matter.
