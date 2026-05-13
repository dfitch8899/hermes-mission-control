// Light tests for the kanban WS→SSE shim helpers. Pure logic only — the
// shim's runtime behavior (EventSource construction, on* handlers) requires
// a browser environment, so the manual browser verification in Phase 3 of
// docs/plans/2026-05-13-kanban-live-updates-sse.md is the coverage there.
//
// Run: node --test scripts/test-kanban-sse-shim.js

const assert = require('node:assert/strict')
const { test } = require('node:test')

// Mirror of the regex used in lib/hermes-plugin-sdk.ts. Keep in sync.
const KANBAN_EVENTS_RE = /\/api\/(?:hermes\/api\/)?plugins\/kanban\/events(?:\?|$)/

// Mirror of the URL derivation logic in KanbanEventsShim.constructor.
function wsToSseUrl(wsUrl) {
  let qs = ''
  try {
    qs = new URL(wsUrl.replace(/^ws/, 'http')).search
  } catch {
    const i = wsUrl.indexOf('?')
    if (i >= 0) qs = wsUrl.slice(i)
  }
  return `/api/hermes/api/plugins/kanban/events.sse${qs}`
}

test('regex matches the unprefixed plugin WS URL', () => {
  assert.ok(KANBAN_EVENTS_RE.test('ws://localhost:3000/api/plugins/kanban/events?board=default'))
})

test('regex matches a wss prefixed variant', () => {
  assert.ok(KANBAN_EVENTS_RE.test('wss://example.com/api/hermes/api/plugins/kanban/events'))
})

test('regex matches with no query string', () => {
  assert.ok(KANBAN_EVENTS_RE.test('ws://localhost:3000/api/plugins/kanban/events'))
})

test('regex rejects the boards endpoint', () => {
  assert.ok(!KANBAN_EVENTS_RE.test('ws://x/api/plugins/kanban/boards'))
})

test('regex rejects a similar-looking-but-wrong URL', () => {
  assert.ok(!KANBAN_EVENTS_RE.test('ws://x/api/plugins/kanban/eventsx'))
})

test('regex rejects a non-kanban WS URL', () => {
  assert.ok(!KANBAN_EVENTS_RE.test('ws://x/api/other/events'))
})

test('wsToSseUrl preserves the full query string', () => {
  assert.equal(
    wsToSseUrl('ws://localhost:3000/api/plugins/kanban/events?board=default&since=42&token=abc'),
    '/api/hermes/api/plugins/kanban/events.sse?board=default&since=42&token=abc',
  )
})

test('wsToSseUrl handles a bare wss URL with no query', () => {
  assert.equal(
    wsToSseUrl('wss://example.com/api/plugins/kanban/events'),
    '/api/hermes/api/plugins/kanban/events.sse',
  )
})

test('wsToSseUrl handles a URL with prefix already applied', () => {
  assert.equal(
    wsToSseUrl('ws://localhost:3000/api/hermes/api/plugins/kanban/events?board=default'),
    '/api/hermes/api/plugins/kanban/events.sse?board=default',
  )
})
