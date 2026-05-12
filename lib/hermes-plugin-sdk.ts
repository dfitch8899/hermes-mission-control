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
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>
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

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, ...p }, ref) =>
  React.createElement('select', { ref, className: cn('hermes-sdk-select rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm', className), ...p }),
)
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
  installed = true
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
