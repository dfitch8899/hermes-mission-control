/**
 * Hermes Plugin SDK shim — hosts native Hermes dashboard plugins inside Mission Control.
 *
 * Contract (derived from inspecting the kanban plugin bundle):
 * - window.__HERMES_PLUGIN_SDK__ exposes React + shadcn-like primitives + utilities.
 *   Plugins destructure: React, Card, CardContent, Badge, Button, Input, Label,
 *   Select, SelectOption, useState, useEffect, useCallback, useMemo, useRef,
 *   cn, timeAgo. Also reads: SDK.fetchJSON, SDK.components, SDK.hooks, SDK.utils.
 * - window.__HERMES_PLUGINS__ exposes register(name, component) for the plugin
 *   to publish its React component once loaded.
 *
 * Network routing: SDK.fetchJSON rewrites /api/* to /api/hermes/api/* so plugin
 * traffic transits MC's same-origin proxy (and gets X-Hermes-Key injected
 * server-side). Plain fetch() inside the bundle would still hit MC origin
 * directly — that's fine for the kanban plugin since all its calls go via
 * SDK.fetchJSON.
 *
 * NOT covered yet (will need follow-up if user reports live updates broken):
 * - The plugin constructs raw WebSocket URLs using window.location.host. These
 *   would hit MC's origin (which doesn't proxy WS). The plugin tolerates WS
 *   failure silently; live updates just don't tick. Manual refresh works.
 *
 * IMPORTANT: only add globals to SDK after observing a real runtime failure
 * naming a missing global. Speculative additions bloat the shim and increase
 * the maintenance surface against future Hermes plugin changes.
 */

'use client'

import * as React from 'react'
import clsx from 'clsx'

const HERMES_PROXY_PREFIX = '/api/hermes'

// ── utils ────────────────────────────────────────────────────────────────────

function cn(...inputs: unknown[]): string {
  return clsx(inputs as never)
}

function timeAgo(input: string | number | Date | null | undefined): string {
  if (input == null) return ''
  let date: Date
  if (input instanceof Date) date = input
  else if (typeof input === 'number') {
    // Hermes timestamps can be seconds or ms; heuristic: anything < 1e12 is seconds
    date = new Date(input < 1e12 ? input * 1000 : input)
  } else {
    const n = Number(input)
    date = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(input)
  }
  const diff = Date.now() - date.getTime()
  if (!Number.isFinite(diff)) return ''
  const abs = Math.abs(diff)
  const past = diff >= 0
  const units: Array<[number, string]> = [
    [60_000, 's'],
    [3_600_000, 'm'],
    [86_400_000, 'h'],
    [604_800_000, 'd'],
    [2_592_000_000, 'w'],
    [31_536_000_000, 'mo'],
    [Infinity, 'y'],
  ]
  let val = 0
  let unit = 's'
  let lower = 1
  for (const [upper, u] of units) {
    if (abs < upper) {
      const divisor = lower === 1 ? 1000 : lower
      val = Math.max(1, Math.floor(abs / divisor))
      unit = u
      break
    }
    lower = upper
  }
  return past ? `${val}${unit} ago` : `in ${val}${unit}`
}

/** Routes /api/* through MC's same-origin Hermes proxy. */
async function fetchJSON(input: string, init: RequestInit = {}): Promise<unknown> {
  const url = rewriteHermesPath(input)
  const headers = new Headers(init.headers || {})
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  const res = await fetch(url, { ...init, headers })
  // The native plugin code throws on !ok and reads JSON only when present.
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}\n${text.slice(0, 500)}`)
  }
  const ctype = res.headers.get('content-type') || ''
  if (ctype.includes('application/json')) return res.json()
  // Plugin sometimes calls endpoints that return empty bodies (e.g. 204)
  const text = await res.text()
  return text ? text : null
}

function rewriteHermesPath(input: string): string {
  if (!input.startsWith('/api/')) return input
  if (input.startsWith(HERMES_PROXY_PREFIX + '/')) return input
  return HERMES_PROXY_PREFIX + input
}

// ── shadcn-style primitives ──────────────────────────────────────────────────
// Minimal: render-children passthrough with className merging. Tailwind classes
// from the plugin's own style.css (which we inject in the host component) carry
// the actual look.

type DivProps = React.HTMLAttributes<HTMLDivElement>
type SpanProps = React.HTMLAttributes<HTMLSpanElement>
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>
type InputProps = React.InputHTMLAttributes<HTMLInputElement>
type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  /** shadcn-style callback: receives the new value (not the event). */
  onValueChange?: (value: string) => void
}
type OptionProps = React.OptionHTMLAttributes<HTMLOptionElement>

const Card = React.forwardRef<HTMLDivElement, DivProps>(({ className, ...p }, ref) =>
  React.createElement('div', { ref, className: cn('hermes-sdk-card rounded-lg border border-zinc-800 bg-zinc-900 shadow-sm', className), ...p }),
)
Card.displayName = 'Card'

const CardContent = React.forwardRef<HTMLDivElement, DivProps>(({ className, ...p }, ref) =>
  React.createElement('div', { ref, className: cn('hermes-sdk-card-content p-4', className), ...p }),
)
CardContent.displayName = 'CardContent'

const Badge = React.forwardRef<HTMLSpanElement, SpanProps>(({ className, ...p }, ref) =>
  React.createElement('span', { ref, className: cn('hermes-sdk-badge inline-flex items-center rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs', className), ...p }),
)
Badge.displayName = 'Badge'

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, ...p }, ref) =>
  React.createElement('button', { ref, className: cn('hermes-sdk-button inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed', className), ...p }),
)
Button.displayName = 'Button'

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...p }, ref) =>
  React.createElement('input', { ref, className: cn('hermes-sdk-input rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm', className), ...p }),
)
Input.displayName = 'Input'

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(({ className, ...p }, ref) =>
  React.createElement('label', { ref, className: cn('hermes-sdk-label text-sm text-zinc-400', className), ...p }),
)
Label.displayName = 'Label'

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, onValueChange, onChange, ...p }, ref) => {
  const handleChange = onValueChange
    ? (e: React.ChangeEvent<HTMLSelectElement>) => {
        onValueChange(e.target.value)
        if (onChange) onChange(e)
      }
    : onChange
  return React.createElement('select', {
    ref,
    className: cn('hermes-sdk-select rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm', className),
    onChange: handleChange,
    ...p,
  })
})
Select.displayName = 'Select'

const SelectOption = React.forwardRef<HTMLOptionElement, OptionProps>(({ className, ...p }, ref) =>
  React.createElement('option', { ref, className, ...p }),
)
SelectOption.displayName = 'SelectOption'

// ── public SDK shape ─────────────────────────────────────────────────────────

interface HermesPluginSdk {
  React: typeof React
  // Hooks (also accessible via SDK.hooks)
  useState: typeof React.useState
  useEffect: typeof React.useEffect
  useCallback: typeof React.useCallback
  useMemo: typeof React.useMemo
  useRef: typeof React.useRef
  hooks: Record<string, unknown>
  // Components (also via SDK.components)
  Card: typeof Card
  CardContent: typeof CardContent
  Badge: typeof Badge
  Button: typeof Button
  Input: typeof Input
  Label: typeof Label
  Select: typeof Select
  SelectOption: typeof SelectOption
  components: Record<string, unknown>
  // Utils (also via SDK.utils)
  cn: typeof cn
  timeAgo: typeof timeAgo
  utils: Record<string, unknown>
  // Network
  fetchJSON: typeof fetchJSON
}

interface HermesPluginsRegistry {
  register(name: string, component: React.ComponentType<unknown>): void
  get(name: string): React.ComponentType<unknown> | null
  all(): Record<string, React.ComponentType<unknown>>
}

declare global {
  interface Window {
    __HERMES_PLUGIN_SDK__?: HermesPluginSdk
    __HERMES_PLUGINS__?: HermesPluginsRegistry
    __HERMES_SESSION_TOKEN__?: string
  }
}

let installed = false
let scriptPromise: Promise<void> | null = null
const registry: Record<string, React.ComponentType<unknown>> = {}

/** Install the SDK + plugins registry on window. Idempotent. */
export function installHermesPluginSdk(): void {
  if (typeof window === 'undefined') return
  if (installed) return

  const hooks = { useState: React.useState, useEffect: React.useEffect, useCallback: React.useCallback, useMemo: React.useMemo, useRef: React.useRef }
  const components = { Card, CardContent, Badge, Button, Input, Label, Select, SelectOption }
  const utils = { cn, timeAgo }
  const sdk: HermesPluginSdk = {
    React,
    ...hooks,
    hooks,
    ...components,
    components,
    ...utils,
    utils,
    fetchJSON,
  }

  const pluginsRegistry: HermesPluginsRegistry = {
    register(name, component) {
      registry[name] = component
      window.dispatchEvent(new CustomEvent('hermes-plugin-registered', { detail: { name } }))
    },
    get(name) { return registry[name] || null },
    all() { return { ...registry } },
  }

  window.__HERMES_PLUGIN_SDK__ = sdk
  window.__HERMES_PLUGINS__ = pluginsRegistry
  installKanbanEventsShim()
  installed = true
}

// ── WebSocket → EventSource shim for kanban live events ──────────────────────
//
// Mission Control deploys to Vercel, which can't proxy WebSocket upgrades.
// The native kanban plugin opens `new WebSocket('ws://<host>/api/plugins/kanban/events?…')`
// for live task events. We monkey-patch `window.WebSocket` to intercept ONLY
// that URL and return an `EventSource`-backed shim that quacks like a WebSocket.
// Everything else (any future plugin that uses WebSocket for something unrelated)
// falls through to the real constructor.
//
// The plugin never calls `.send()` on the events socket — it's a read-only
// stream. So the shim's `send()` is a no-op with a warning.
//
// Hermes serves the SSE mirror at `/events.sse` (added by
// hermes-agent/patches/kanban_sse_patch.py). Same JSON payload shape per frame
// as the WS endpoint, so the plugin's `onmessage` handler doesn't notice the
// transport swap.

const KANBAN_EVENTS_RE = /\/api\/(?:hermes\/api\/)?plugins\/kanban\/events(?:\?|$)/

function installKanbanEventsShim(): void {
  if (typeof window === 'undefined') return
  if ((window as unknown as { __kanbanWsShimmed?: boolean }).__kanbanWsShimmed) return
  ;(window as unknown as { __kanbanWsShimmed?: boolean }).__kanbanWsShimmed = true

  const RealWS = window.WebSocket
  const Shim = function (this: unknown, url: string | URL, protocols?: string | string[]) {
    const urlStr = typeof url === 'string' ? url : url.toString()
    if (KANBAN_EVENTS_RE.test(urlStr)) {
      return new KanbanEventsShim(urlStr) as unknown as WebSocket
    }
    return new RealWS(urlStr, protocols)
  } as unknown as typeof WebSocket

  // Preserve the readyState constants the plugin reads off the constructor.
  Object.assign(Shim, {
    CONNECTING: RealWS.CONNECTING,
    OPEN:       RealWS.OPEN,
    CLOSING:    RealWS.CLOSING,
    CLOSED:     RealWS.CLOSED,
  })
  window.WebSocket = Shim
}

/**
 * Minimal `WebSocket`-shaped wrapper around `EventSource` for the kanban
 * /events endpoint. The native plugin only reads `readyState`, sets the four
 * on* handlers, and calls `close()` — that's the surface this implements.
 */
class KanbanEventsShim {
  static readonly CONNECTING = 0
  static readonly OPEN       = 1
  static readonly CLOSING    = 2
  static readonly CLOSED     = 3

  readonly CONNECTING = 0
  readonly OPEN       = 1
  readonly CLOSING    = 2
  readonly CLOSED     = 3

  readyState     = 0
  binaryType     = 'blob' as const
  bufferedAmount = 0
  extensions     = ''
  protocol       = ''
  url:           string

  onopen:    ((this: WebSocket, ev: Event) => unknown)        | null = null
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null
  onerror:   ((this: WebSocket, ev: Event) => unknown)        | null = null
  onclose:   ((this: WebSocket, ev: CloseEvent) => unknown)   | null = null

  private es: EventSource | null = null
  private cycleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(wsUrl: string) {
    this.url = wsUrl
    this._connect(wsUrl)

    // In dev mode, periodically cycle the connection so Next.js's hot-reload
    // can swap webpack chunks without a held route-handler module reference.
    // EventSource auto-reconnects transparently with Last-Event-ID, so the
    // plugin doesn't see any disruption. In prod this is a no-op since the
    // dev cycle window is only set when NODE_ENV !== 'production'.
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      this.cycleTimer = setInterval(() => {
        const prev = this.es
        if (prev && prev.readyState !== 2) {
          this._connect(wsUrl)
          prev.close()
        }
      }, 45_000)
    }
  }

  private _connect(wsUrl: string): void {
    // ws://host/api/plugins/kanban/events?qs → /api/hermes/api/plugins/kanban/events.sse?qs
    let qs = ''
    try {
      qs = new URL(wsUrl.replace(/^ws/, 'http')).search
    } catch {
      const i = wsUrl.indexOf('?')
      if (i >= 0) qs = wsUrl.slice(i)
    }
    const sseUrl = `/api/hermes/api/plugins/kanban/events.sse${qs}`

    try {
      this.es = new EventSource(sseUrl)
    } catch (err) {
      // Synthesize an error event so the plugin's onerror path runs.
      queueMicrotask(() => this.onerror?.call(this as unknown as WebSocket, new Event('error')))
      return
    }

    this.es.onopen = () => {
      this.readyState = 1
      this.onopen?.call(this as unknown as WebSocket, new Event('open'))
    }
    this.es.onmessage = (e: MessageEvent) => {
      // Pass through. The plugin parses e.data with JSON.parse, and the
      // SSE handler emits the same {events, cursor} shape as the WS one.
      this.onmessage?.call(this as unknown as WebSocket, e)
    }
    this.es.onerror = (e: Event) => {
      // EventSource auto-reconnects unless we close. Surface as ws.onerror
      // so the plugin can flag degraded liveness, but DON'T close — let the
      // browser retry transparently.
      this.onerror?.call(this as unknown as WebSocket, e)
    }
  }

  send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    // The kanban plugin never calls send() on its events socket.
    if (typeof console !== 'undefined') {
      console.warn('[hermes-plugin-sdk] kanban events shim ignored .send() — read-only stream')
    }
  }

  close(_code?: number, _reason?: string): void {
    if (this.cycleTimer) { clearInterval(this.cycleTimer); this.cycleTimer = null }
    this.es?.close()
    this.es = null
    this.readyState = 3
    const ev = typeof CloseEvent === 'function'
      ? new CloseEvent('close', { wasClean: true, code: 1000 })
      : (new Event('close') as unknown as CloseEvent)
    this.onclose?.call(this as unknown as WebSocket, ev)
  }

  // EventTarget compatibility — plugin uses on* properties, not addEventListener,
  // but stub these so libraries that probe addEventListener don't crash.
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const wrapped = (typeof listener === 'function'
      ? listener
      : (e: Event) => (listener as EventListenerObject).handleEvent(e)
    ) as never
    if (type === 'open')    this.onopen    = wrapped
    if (type === 'message') this.onmessage = wrapped
    if (type === 'error')   this.onerror   = wrapped
    if (type === 'close')   this.onclose   = wrapped
  }
  removeEventListener(type: string): void {
    if (type === 'open')    this.onopen    = null
    if (type === 'message') this.onmessage = null
    if (type === 'error')   this.onerror   = null
    if (type === 'close')   this.onclose   = null
  }
  dispatchEvent(_event: Event): boolean { return false }
}

/** Load a Hermes plugin script tag once. Returns a cached promise on repeat calls. */
export function loadHermesPluginScript(src: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = Array.from(document.scripts).find(s => s.src.endsWith(src))
    if (existing) { resolve(); return }
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`Failed to load Hermes plugin script: ${src}`))
    document.head.appendChild(el)
  })
  return scriptPromise
}

/** Read a registered plugin component (null if not yet registered). */
export function getRegisteredHermesPlugin(name: string): React.ComponentType<unknown> | null {
  return registry[name] || null
}
