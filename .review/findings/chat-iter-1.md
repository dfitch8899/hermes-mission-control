# Chat Feature Code Review — Iteration 1

**Reviewed:** 2026-05-14
**Depth:** standard
**Scope:**
- `app/chat/page.tsx`
- `app/api/chat/route.ts`
- `app/api/chat/approve/route.ts`
- `app/api/chats/route.ts`
- `app/api/chats/[chatId]/route.ts`

(no `components/chat/**` directory exists in tree)

**Out of scope:** `lib/hermesClient*` — M-02 / M-03 already tracked in hermes-integration findings.

---

## Summary

| Severity | Count |
|----------|------:|
| Critical |     2 |
| Warning  |     7 |
| Info     |     4 |
| **Total**|    13 |

Two critical issues: (1) all `/api/chats*` routes lack auth, allowing any unauthenticated caller to enumerate/read/delete every user's chat history; (2) `/api/chat/approve` does not check the session before posting to Slack on behalf of the user. Several warnings around stale state in the SSE stream loop, race conditions in `loadChat`, and missing input validation. Most quality issues are minor.

---

## CRITICAL

### CR-01 — Chat list/read/delete endpoints have no authentication
**Severity:** Critical (security)
**Files:**
- `app/api/chats/route.ts:14` (GET), `:41` (POST)
- `app/api/chats/[chatId]/route.ts:5` (GET), `:42` (DELETE)

**Issue:** None of these handlers call `getServerSession(authOptions)`. They unconditionally query/mutate the `chats` table partitioned only by `pk = 'CHATLIST'` or `pk = 'CHAT#${chatId}'`. There is no `userId` scoping at all — the schema appears single-tenant. Anyone who can reach these routes (e.g. an unauthenticated request to the deployed app, or any logged-in user) can:
- list every chat ever created (`GET /api/chats`)
- read every message in any chat by guessing/enumerating `chatId` (`GET /api/chats/[chatId]`)
- delete any chat (`DELETE /api/chats/[chatId]`)
- inject a forged chat into the sidebar (`POST /api/chats`)

`chatId` is `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}` (route.ts:15) — only ~16 bits of entropy in the random suffix; with the timestamp prefix often visible in the sidebar listing, this is trivially enumerable.

```ts
// app/api/chats/[chatId]/route.ts:5
export async function GET(
  _req: NextRequest,
  { params }: { params: { chatId: string } },
) {
  const { chatId } = params
  try {
    const [msgResult, chatItem] = await Promise.all([
      ddb.send(new QueryCommand({ ... })),    // no userId
```

**Fix:**
1. Gate every handler with `getServerSession(authOptions)`; reject with 401 if absent.
2. Add `userId` (or `userEmail`) to the DynamoDB item shape on write (in `createChatRecord`, `saveMessageRecord`, `POST /api/chats`).
3. Scope reads by user: either change pk to `USER#${userId}#CHATLIST`, or filter results by `userId` after the query (acceptable short-term but wastes RCU and doesn't help DELETE).
4. For DELETE/GET-by-id, verify the chat's `userId` matches the session before acting.

**Classification:** FLAGGED — auth flow change.

---

### CR-02 — `/api/chat/approve` posts to Slack with no auth check
**Severity:** Critical (security)
**File:** `app/api/chat/approve/route.ts:11`

**Issue:** The route fetches the session at line 18 to get `slackId` / name, but never checks whether the session exists. An anonymous caller can POST `{ channel, messageTs, decision }` and the handler will:
- forge a `block_actions` payload to `HERMES_ACTION_URL` (impersonating "Mission Control"), or
- post to `https://slack.com/api/chat.postMessage` using `SLACK_USER_TOKEN` with `as_user: true`.

This means any internet user can approve/deny pending Hermes commands and post under the bot's identity. `userId` from the session is silently empty for anonymous callers (`?? ''`), so the impersonation succeeds.

```ts
// app/api/chat/approve/route.ts:18-20
const session = await getServerSession(authOptions)
const userId   = (session?.user as { slackId?: string })?.slackId ?? ''
const userName = session?.user?.name ?? session?.user?.email ?? 'Mission Control'
```

There's also no validation that `channel` / `messageTs` correspond to an actual pending approval owned by this user.

**Fix:**
```ts
const session = await getServerSession(authOptions)
if (!session?.user) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
```
And ideally cross-check `(channel, messageTs)` against a server-side store of pending permission requests for that user before forwarding.

**Classification:** FLAGGED — auth flow + Hermes/Slack transport.

---

## WARNING

### WR-01 — SSE handler reads `event.text` after closure escape, but `text` is on the captured event — OK; however `event.text!` non-null assertion masks real null cases
**Severity:** Warning (bug-prone)
**File:** `app/chat/page.tsx:770-773`

```ts
} else if (event.type === 'text_replace' && event.text !== undefined) {
  setMessages(prev =>
    prev.map(m => m.id === assistantId ? { ...m, content: event.text! } : m),
  )
```

The guard `event.text !== undefined` lets empty string `""` through but the `!` is just stylistic. Bigger issue: `event.text` of empty string overwrites accumulated content — if the server ever emits a stray `text_replace` with `""` between updates, the displayed message blanks out. Recommend tightening to `typeof event.text === 'string' && event.text.length > 0` or distinguishing `text_replace` (full snapshot) from `text_append`.

**Fix:** Either accept `""` as a deliberate clear, or guard against it: `if (typeof event.text === 'string')`.

**Classification:** AUTO-SAFE.

---

### WR-02 — Stale `messages` captured by `sendMessage` closure
**Severity:** Warning (bug)
**File:** `app/chat/page.tsx:706-846`, particularly `:716` and `:846`

`sendMessage` is `useCallback` with `[input, isStreaming, messages, fetchChats]` deps. Because `messages` is a dep, the callback is recreated on every message render. The `history` built at line 716 uses the closure's `messages`, but the surrounding `setMessages(prev => ...)` calls that fire just before (line 711) update state asynchronously — so `messages` at line 716 is the value from the render that produced this callback, which is the state BEFORE the user message was added. That's actually correct in this flow because line 716 manually concatenates `userMsg`. However the dep on `messages` causes:

1. `useEffect` at line 852 has `sendMessage` in its dep list. Each new `messages` value gives a new `sendMessage` identity, retriggering the effect. The `autoExecutedRef` guards against re-fire, but the effect body still runs (cheap, but noisy).
2. More importantly, `useEffect` at line 674 (`scrollToBottom`) is unrelated. The real risk is if anyone later reads `messages` later in the callback expecting "current," they'll get stale.

**Fix:** Replace the `messages` closure read at line 716 with a ref (`messagesRef.current`) or pass via `setMessages(prev => ...)`. Drop `messages` from `useCallback` deps. Same pattern as already used for `currentChatIdRef` / `currentAgentIdRef`.

**Classification:** AUTO-SAFE.

---

### WR-03 — `loadChat` race: clicking a chat while streaming can interleave histories
**Severity:** Warning (bug)
**File:** `app/chat/page.tsx:640-649`

```ts
const loadChat = useCallback(async (chatId: string) => {
  try {
    const r = await fetch(`/api/chats/${chatId}`)
    if (!r.ok) return
    const d = await r.json() as { messages: Message[]; agentId?: string }
    setMessages(d.messages.length ? d.messages : [WELCOME])
    setChatId(chatId)
    setAgentId(d.agentId ?? 'general')
```

There's no abort/guard for in-flight streams. If a user clicks an old chat in the sidebar while `isStreaming === true`, the SSE loop continues writing into `assistantId` of the *new* chat's view. Also, two rapid clicks on different chats race — the slower fetch wins.

Additionally there's no auth/userId scoping (see CR-01), and the response is trusted blindly: `setMessages(d.messages)` accepts whatever the server returned, including `id` collisions or malformed roles.

**Fix:** Track an `AbortController` + a `loadEpoch` ref; on click, increment epoch and bail in the SSE loop / fetch handler if epoch changed. Also reset/cancel any active streaming reader before switching chats.

**Classification:** AUTO-SAFE.

---

### WR-04 — Permission decision PATCH not awaited in UI; UI marks "approved" even if Slack call failed
**Severity:** Warning (bug / UX)
**File:** `app/chat/page.tsx:283-295`

```ts
const decide = async (decision: 'approve' | 'deny') => {
  setLoading(true)
  try {
    await fetch('/api/chat/approve', { ... })
    onDecision(perm.ts, decision)
  } finally {
    setLoading(false)
  }
}
```

`fetch` resolves even on HTTP 500. `onDecision` flips the card to "Approved" regardless of whether `/api/chat/approve` succeeded. User sees a green check while Slack rejected the call.

**Fix:**
```ts
const res = await fetch('/api/chat/approve', { ... })
if (!res.ok) {
  // surface error inline; keep card pending
  return
}
onDecision(perm.ts, decision)
```

**Classification:** FLAGGED — touches approve flow / Hermes transport.

---

### WR-05 — `userText` may be `undefined` when `content` is non-string array with no `text` blocks
**Severity:** Warning (bug)
**File:** `app/api/chat/route.ts:65-67`

```ts
const userText = typeof lastUser.content === 'string'
  ? lastUser.content
  : (lastUser.content as Array<{ text?: string }>)?.map(b => b.text).join(' ')
```

If `content` is an array of blocks with no `text` field, `.map(b => b.text)` yields `[undefined, undefined]` and `.join(' ')` becomes `"undefined undefined"`. Then `createChatRecord(userText, ...)` stores `"undefined undefined"` as the title. There's also no check that `userText` is non-empty before sending to Hermes — an empty/whitespace user message will still trigger the stream.

**Fix:**
```ts
const userText = typeof lastUser.content === 'string'
  ? lastUser.content
  : (lastUser.content as Array<{ text?: string }>)
      ?.map(b => b.text)
      .filter((t): t is string => typeof t === 'string')
      .join(' ') ?? ''

if (!userText.trim()) {
  return new Response(JSON.stringify({ error: 'Empty message' }), { status: 400 })
}
```

**Classification:** AUTO-SAFE.

---

### WR-06 — DELETE chat: not atomic; partial failure leaves orphan messages
**Severity:** Warning (data integrity)
**File:** `app/api/chats/[chatId]/route.ts:47-67`

The handler queries all messages, fires `Promise.all(...DeleteCommand...)`, then deletes the CHATLIST entry. If any individual DeleteCommand rejects, the outer `Promise.all` rejects, the CHATLIST delete is skipped, and the chat reappears in the sidebar but with corrupted state — or worse, future `loadChat` reads partial messages. Also: no pagination — for chats with >1MB of messages, `QueryCommand` returns only the first page, and silently leaks the rest. No `BatchWriteItem` (limit 25/batch with retry on `UnprocessedItems`).

**Fix:** Use `BatchWriteItem` in chunks of 25 with unprocessed-item retry, paginate via `LastEvaluatedKey`, and ensure the CHATLIST entry is deleted last in a way that's idempotent. Consider a TTL attribute on the chat record + soft-delete flag as a simpler model.

**Classification:** AUTO-SAFE.

---

### WR-07 — `chatId` generation is not collision-resistant
**Severity:** Warning (data integrity / minor security)
**Files:** `app/api/chat/route.ts:15`, `app/api/chats/route.ts:45`

```ts
const chatId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
```

`Math.random()` is non-cryptographic. The random suffix is 4 base-36 chars (~20 bits). Combined with the timestamp prefix in the listing, an attacker can enumerate plausible chatIds (cf. CR-01). Two concurrent creates in the same millisecond have ~1/1M collision odds — small but real, and `PutCommand` without `ConditionExpression: 'attribute_not_exists(sk)'` will silently overwrite.

**Fix:** Use `crypto.randomUUID()` (Node 19+, available in Next.js runtime) for `chatId`. Add `ConditionExpression: 'attribute_not_exists(sk)'` to the PutCommand in `createChatRecord`.

**Classification:** AUTO-SAFE.

---

## INFO

### IN-01 — `parseOrchestratorContent` runs on every render of `AssistantBubble`
**Severity:** Info
**File:** `app/chat/page.tsx:407`

`parseOrchestratorContent(message.content)` does regex parsing on every render. For long chats with many assistant messages, this is wasteful. Wrap in `useMemo(() => parseOrchestratorContent(message.content), [message.content])`.

**Classification:** AUTO-SAFE.

---

### IN-02 — `formatRelativeTime` doesn't update without a re-render
**Severity:** Info
**File:** `app/chat/page.tsx:51-63`, used at `:555`

Sidebar timestamps show "just now" / "5m ago" but don't tick unless `chats` changes. Minor UX. Consider an interval refresh of the sidebar (60s) when no chat is active.

**Classification:** AUTO-SAFE.

---

### IN-03 — Truncation marker uses real UTF "…" but title check uses `length > 80`
**Severity:** Info
**File:** `app/api/chat/route.ts:16`

```ts
const title = firstMessage.slice(0, 80) + (firstMessage.length > 80 ? '…' : '')
```

The slice is by JS string units (UTF-16 code units), not graphemes. Emojis or surrogate pairs in the first 80 chars can be cut mid-codepoint and corrupt the title. Use `Array.from(firstMessage).slice(0, 80).join('')` for codepoint-safe truncation, or `Intl.Segmenter` for grapheme-safe.

**Classification:** AUTO-SAFE.

---

### IN-04 — `kanbanBoardRef.current = boardParam ?? 'default'` accepts any string from URL
**Severity:** Info
**File:** `app/chat/page.tsx:867`

`boardParam` flows from `searchParams.get('board')` directly into `fetch(`/api/kanban/${tid}?board=${board}`)` (line 839). Although `board` ends up as a query param (not a path), an attacker-supplied URL like `/chat?prompt=hi&kanbanTask=foo&board=evil%26x=y` could attach arbitrary query params. Low impact (caller is the user themselves), but worth `encodeURIComponent(board)` on the fetch.

**Classification:** AUTO-SAFE.

---

## Items intentionally NOT flagged

- React StrictMode double-fetch of `/api/chats` — known dev-only behavior.
- `hermesClient.chatSend` 401 fallback (M-02), SSE `[DONE]` inner-loop break (M-03) — tracked in hermes-integration.
- Inline-style heavy JSX — project convention, not a quality issue.
- `console.error` in catch blocks — appropriate for API routes here.

---

_Reviewer: gsd-code-reviewer · Depth: standard · 2026-05-14_
