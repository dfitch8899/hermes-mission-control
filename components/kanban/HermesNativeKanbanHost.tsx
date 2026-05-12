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
    <div className="flex-1 overflow-auto bg-zinc-950 text-zinc-100">
      <Plugin />
    </div>
  )
}
