# CRITICAL Security Summary — All Areas

The most consequential finding from this entire review crosses every feature area:

## The Root Cause: middleware.ts is fully disabled

**File:** [middleware.ts](middleware.ts)

```ts
// Auth temporarily disabled — restore when Google OAuth is configured
// To re-enable: uncomment the block below and delete the two lines after it
export function middleware() {}
export const config = { matcher: [] }
```

The comment makes this intentional, but the consequence is that **every API route in this app is publicly accessible to anyone with network reachability.** This is a known, deferred decision — but it makes the following CRITICAL findings actionable instead of theoretical.

---

## Critical findings that depend on the middleware gap

If MC ever becomes reachable beyond localhost / private VPC, all of these become exploitable:

### Terminal area — CR-01, CR-02 (CRITICAL)
- `/api/terminal/execute` reads session for display name only; never enforces it.
- Allow-list validates only the first command token (`parseBase(command)`); the rest of the string flows verbatim into `hermesClient.exec` → remote Hermes CLI.
- **Combined effect:** Anonymous remote attacker can invoke any Hermes CLI command with arbitrary arguments, including `/background <prompt>` for prompt-injection through the chat path.

### Chat area — CR-01, CR-02 (CRITICAL)
- `/api/chats` GET/POST/DELETE — no auth, no userId scoping; anyone can read/delete every user's chat history.
- `chatId` is ~20 bits of randomness (`Math.random().toString(36).slice(2,10)`), trivially enumerable.
- `/api/chat/approve` fetches session for username but never checks `if (!session)`. Anonymous callers can forge Slack `block_actions` payloads to `HERMES_ACTION_URL`.

### Agents area — CR-01, CR-02 (CRITICAL)
- Zero auth on POST/PATCH/DELETE/seed including `?force=1`. Anyone reachable can wipe builtins.
- `seed?force=1` branch in [app/api/agents/seed/route.ts:39-50](app/api/agents/seed/route.ts) does the **opposite** of its comment — spread order means renames/icon/model/policy edits all revert; only `systemPrompt` is preserved.

### Memory area — CR-01 (CRITICAL)
- No auth on POST/PUT/DELETE `/api/memories`.
- PUT accepts `Partial<Memory>` with no whitelist — callers can forge `source: "hermes"`, overwrite `createdAt`/`version`, or inject novel DynamoDB attributes.

### Calendar area — H2 (HIGH, FLAGGED)
- `ScanCommand` not paginated. The sync route's orphan-cleanup branch will **delete valid rows** once the table exceeds 1 MB because they appear "missing" on the truncated scan.

### Hermes inbound webhook — already correct
The single authenticated mutation surface (`/api/hermes/update`) DOES enforce `X-Hermes-Key`. This is the model the rest of MC's mutation surface needs to follow (either via middleware or per-route).

---

## Recommended remediation order

1. **Restore middleware.** Uncomment lines 4-6 of [middleware.ts](middleware.ts), then test that the configured OAuth provider works end-to-end. This single change closes most of the critical exposure above without touching any route handler.
2. **Per-route auth fallbacks.** Even with middleware restored, mutation routes should still call `getServerSession()` and bail on null so an accidental middleware misconfig can't open them again.
3. **Tighten terminal allow-list (CR-02).** Validate per-command argument schemas; do not pass arbitrary argv into `hermesClient.exec`. Add a contract test asserting MC's allow-list ⊆ `mc_proxy.EXEC_WHITELIST`.
4. **Fix calendar orphan-cleanup pagination (H2).** Paginate `ScanCommand` in `app/api/calendar/sync/route.ts` before the orphan-delete pass.
5. **Add `attribute_not_exists` conditions to seeds and creates** to prevent TOCTOU under StrictMode + concurrent first-time visits.

---

## Why the loop is NOT auto-fixing any of these

Per the review plan safety rails, auth changes, AWS SDK changes, and Hermes-touching code are FLAGGED — never auto-applied. The loop produces this report; a human applies the fixes.
