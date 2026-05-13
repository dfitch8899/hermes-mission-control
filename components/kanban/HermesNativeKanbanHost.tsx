'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import {
  installHermesPluginSdk,
  loadHermesPluginScript,
  getRegisteredHermesPlugin,
} from '@/lib/hermes-plugin-sdk'

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; Plugin: React.ComponentType<unknown> }

const PLUGIN_SCRIPT = '/api/hermes/dashboard-plugins/kanban/dist/index.js'
const PLUGIN_STYLES = '/api/hermes/dashboard-plugins/kanban/dist/style.css'
const REGISTRATION_TIMEOUT_MS = 8_000

export default function HermesNativeKanbanHost() {
  const [state, setState] = React.useState<State>({ kind: 'loading' })
  const mounted = React.useRef(true)

  React.useEffect(() => {
    mounted.current = true

    // Inject the plugin's stylesheet once.
    if (typeof document !== 'undefined') {
      const existing = document.querySelector(`link[data-hermes-plugin-css="kanban"]`)
      if (!existing) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = PLUGIN_STYLES
        link.setAttribute('data-hermes-plugin-css', 'kanban')
        document.head.appendChild(link)
      }
    }

    installHermesPluginSdk()

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let listener: ((e: Event) => void) | null = null

    const promote = () => {
      const Plugin = getRegisteredHermesPlugin('kanban')
      if (Plugin) {
        if (mounted.current) setState({ kind: 'ready', Plugin })
        return true
      }
      return false
    }

    ;(async () => {
      try {
        await loadHermesPluginScript(PLUGIN_SCRIPT)
      } catch (err) {
        if (mounted.current) {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
        return
      }
      // Plugin may register synchronously during script execution OR later.
      if (promote()) return
      listener = () => { promote() }
      window.addEventListener('hermes-plugin-registered', listener)
      timeoutId = setTimeout(() => {
        if (!mounted.current) return
        if (!getRegisteredHermesPlugin('kanban')) {
          setState({
            kind: 'error',
            message: 'Plugin loaded but never called __HERMES_PLUGINS__.register("kanban", ...). ' +
                     'Check browser console for plugin errors (likely a missing SDK global).',
          })
        }
      }, REGISTRATION_TIMEOUT_MS)
    })()

    return () => {
      mounted.current = false
      if (timeoutId) clearTimeout(timeoutId)
      if (listener) window.removeEventListener('hermes-plugin-registered', listener)
    }
  }, [])

  if (state.kind === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading Hermes kanban…
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950 px-6">
        <div className="max-w-2xl w-full rounded-lg border border-red-500/40 bg-zinc-900 p-6 text-zinc-100">
          <h2 className="text-lg font-semibold mb-2 text-red-300">Failed to load native kanban plugin</h2>
          <p className="text-sm text-zinc-400 mb-3">{state.message}</p>
          <p className="text-xs text-zinc-500">
            Check the browser console for the underlying error, and verify the
            port-forward / Hermes container are serving{' '}
            <code className="rounded bg-zinc-800 px-1">{PLUGIN_SCRIPT}</code>.
          </p>
        </div>
      </div>
    )
  }

  const { Plugin } = state
  return (
    <div
      className="hermes-kanban-host flex-1 overflow-auto bg-surface text-on-background"
      style={HERMES_THEME_VARS}
    >
      <div className="px-6 py-4">
        <Plugin />
      </div>
    </div>
  )
}

/**
 * Hermes dashboard theme tokens the kanban plugin CSS reads via `var(--…)`.
 * The dashboard's own SPA defines these; since we're not loading that SPA, we
 * have to provide them ourselves. Values chosen to align with MC's Liquid
 * Glass palette in `tailwind.config.ts` so the board reads as part of MC.
 */
const HERMES_THEME_VARS: React.CSSProperties = {
  // Surfaces
  ['--color-card' as string]:         '#191f30', // surface-container
  ['--color-card-subtle' as string]:  '#151b2c', // surface-container-low
  // Text
  ['--color-foreground' as string]:        '#dde2f9', // on-background
  ['--color-muted-foreground' as string]:  '#859398', // outline
  // Lines + focus
  ['--color-border' as string]:      '#3c494e', // outline-variant
  ['--color-ring' as string]:        '#3cd7ff', // primary-fixed-dim
  ['--color-destructive' as string]: '#ffb4ab', // error
  // Geometry
  ['--radius' as string]:    '8px',
  ['--radius-sm' as string]: '4px',
  // Typography
  ['--font-mono' as string]: 'var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
  // Plugin-specific tokens
  ['--hermes-kanban-drawer-width' as string]: '480px',
  ['--hermes-diag-warning' as string]:  '#ff9e3b',
  ['--hermes-diag-error' as string]:    '#ff6b3d',
  ['--hermes-diag-critical' as string]: '#ff4d4d',
}
