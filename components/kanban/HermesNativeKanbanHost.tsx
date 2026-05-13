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
      <div className="flex flex-1 items-center justify-center text-on-surface-variant/70">
        <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary-fixed-dim" />
        <span className="font-mono text-xs uppercase tracking-widest">
          Loading Hermes kanban…
        </span>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div
          className="max-w-2xl w-full rounded-2xl p-6 text-on-background"
          style={{
            background:    'rgba(25, 31, 48, 0.45)',
            backdropFilter:'blur(12px) saturate(160%)',
            WebkitBackdropFilter: 'blur(12px) saturate(160%)',
            border:        '1px solid rgba(255, 180, 171, 0.25)',
            boxShadow:     '0 8px 32px rgba(0, 0, 0, 0.37), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          }}
        >
          <h2 className="text-lg font-semibold mb-2 text-error">Failed to load native kanban plugin</h2>
          <p className="text-sm text-on-surface-variant/80 mb-3" style={{ textWrap: 'pretty' }}>
            {state.message}
          </p>
          <p className="text-xs text-on-surface-variant/60">
            Check the browser console for the underlying error, and verify the
            Hermes endpoint is reachable at{' '}
            <code className="rounded bg-black/30 border border-white/5 px-1.5 py-0.5 font-mono">
              {PLUGIN_SCRIPT}
            </code>.
          </p>
        </div>
      </div>
    )
  }

  const { Plugin } = state
  return (
    <>
      <HermesKanbanLiquidGlass />
      <div
        className="hermes-kanban-host flex-1 overflow-auto text-on-background animate-fade-in-up"
        style={HERMES_THEME_VARS}
      >
        <div className="px-6 py-5">
          <Plugin />
        </div>
      </div>
    </>
  )
}

/**
 * Scoped style overrides that lift the native plugin onto MC's Liquid Glass
 * surface system. Everything is scoped to `.hermes-kanban-host` so it can't
 * leak into the rest of MC.
 *
 * The plugin already uses `var(--color-card)` etc. for its base look — those
 * tokens are set on the host wrapper above. This block layers in things the
 * tokens alone can't express:
 *   - backdrop-filter for true glass blur
 *   - hover lift + accent border glow on cards (matches `.glass-card`)
 *   - column gap + soft inner highlight
 *   - mono uppercase column labels (matches old MC board language)
 *   - cyan focus halo on the active drop zone
 */
function HermesKanbanLiquidGlass() {
  return (
    <style jsx global>{`
      .hermes-kanban-host .hermes-kanban-column {
        backdrop-filter: blur(12px) saturate(160%);
        -webkit-backdrop-filter: blur(12px) saturate(160%);
        box-shadow:
          0 8px 24px -12px rgba(0, 0, 0, 0.45),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
        transition:
          border-color 200ms cubic-bezier(0.23, 1, 0.32, 1),
          background-color 200ms cubic-bezier(0.23, 1, 0.32, 1),
          box-shadow 200ms cubic-bezier(0.23, 1, 0.32, 1);
      }

      .hermes-kanban-host .hermes-kanban-column--drop {
        box-shadow:
          0 0 0 1px rgba(60, 215, 255, 0.35),
          0 0 32px -8px rgba(60, 215, 255, 0.35),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }

      .hermes-kanban-host .hermes-kanban-column-label {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .hermes-kanban-host .hermes-kanban-columns {
        gap: 1rem;
      }

      /* Status dot glow — matches old MC KanbanColumn boxShadow style */
      .hermes-kanban-host .hermes-kanban-dot-triage   { box-shadow: 0 0 8px rgba(184, 196, 255, 0.55); }
      .hermes-kanban-host .hermes-kanban-dot-todo     { box-shadow: 0 0 8px rgba(133, 147, 152, 0.45); }
      .hermes-kanban-host .hermes-kanban-dot-ready    { box-shadow: 0 0 8px rgba(255, 179, 0, 0.55); }
      .hermes-kanban-host .hermes-kanban-dot-running  { box-shadow: 0 0 8px rgba(93, 246, 224, 0.6); }
      .hermes-kanban-host .hermes-kanban-dot-blocked  { box-shadow: 0 0 8px rgba(255, 107, 61, 0.55); }
      .hermes-kanban-host .hermes-kanban-dot-done     { box-shadow: 0 0 8px rgba(60, 215, 255, 0.55); }

      /* Task cards — hover lift, accent border on hover */
      .hermes-kanban-host .hermes-kanban-card,
      .hermes-kanban-host [class*="hermes-kanban-task"] {
        transition:
          transform 200ms cubic-bezier(0.23, 1, 0.32, 1),
          border-color 200ms cubic-bezier(0.23, 1, 0.32, 1),
          background-color 200ms cubic-bezier(0.23, 1, 0.32, 1),
          box-shadow 200ms cubic-bezier(0.23, 1, 0.32, 1);
        will-change: transform;
      }

      .hermes-kanban-host .hermes-kanban-card:hover,
      .hermes-kanban-host [class*="hermes-kanban-task"]:hover {
        transform: translateY(-1px);
        border-color: rgba(60, 215, 255, 0.25);
        box-shadow:
          0 6px 18px -8px rgba(0, 212, 255, 0.18),
          0 0 0 1px rgba(60, 215, 255, 0.15) inset;
      }

      /* Buttons / pills in the toolbar — soft glass treatment */
      .hermes-kanban-host button,
      .hermes-kanban-host .hermes-kanban-button {
        font-family: var(--font-body, var(--font-inter, system-ui));
        transition:
          background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
          border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
          color 160ms cubic-bezier(0.23, 1, 0.32, 1),
          scale 80ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      .hermes-kanban-host button:active {
        scale: 0.96;
      }

      /* Numbers — task counts, ages — should not jitter as they update */
      .hermes-kanban-host .hermes-kanban-column-count,
      .hermes-kanban-host [class*="age"],
      .hermes-kanban-host time {
        font-variant-numeric: tabular-nums;
      }

      /* Scrollbars inside columns — match MC's cyan-tinted ones */
      .hermes-kanban-host ::-webkit-scrollbar {
        width: 4px;
        height: 4px;
      }
      .hermes-kanban-host ::-webkit-scrollbar-thumb {
        background: rgba(168, 232, 255, 0.18);
        border-radius: 2px;
      }
      .hermes-kanban-host ::-webkit-scrollbar-thumb:hover {
        background: rgba(168, 232, 255, 0.32);
      }
    `}</style>
  )
}

/**
 * Hermes dashboard theme tokens the kanban plugin CSS reads via `var(--…)`.
 *
 * The dashboard's own SPA defines these — since we're not loading that SPA,
 * we provide values mapped to MC's Liquid Glass palette (see
 * [globals.css](../../app/globals.css) and `tailwind.config.ts`) so the
 * native board reads as part of MC instead of as a transplant.
 *
 * Card/border surfaces use translucent RGBA so the page's ambient gradient
 * shows through — this is what makes other MC panels feel like Liquid Glass.
 * The plugin's CSS in turn paints columns via `color-mix(...)` over these
 * tokens, so translucency cascades correctly without overrides.
 */
const HERMES_THEME_VARS: React.CSSProperties = {
  // Translucent surfaces — let the page ambient gradient bleed through
  ['--color-card' as string]:         'rgba(25, 31, 48, 0.45)',   // matches .glass-card-glow
  ['--color-card-subtle' as string]:  'rgba(13, 19, 35, 0.55)',   // matches .glass-panel
  // Text
  ['--color-foreground' as string]:        '#dde2f9',              // on-background
  ['--color-muted-foreground' as string]:  'rgba(187, 201, 207, 0.75)', // on-surface-variant @ 75%
  // Lines + focus — soft white tints, matches glass-panel borders
  ['--color-border' as string]:      'rgba(255, 255, 255, 0.08)',  // matches .glass-panel
  ['--color-ring' as string]:        '#3cd7ff',                    // primary-fixed-dim (cyan accent)
  ['--color-destructive' as string]: '#ffb4ab',                    // error
  // Geometry — concentric: outer 16px, inner 8px (matches rounded-2xl / rounded-lg)
  ['--radius' as string]:    '16px',
  ['--radius-sm' as string]: '8px',
  // Typography
  ['--font-mono' as string]: 'var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
  // Plugin-specific tokens
  ['--hermes-kanban-drawer-width' as string]: '480px',
  ['--hermes-diag-warning' as string]:  '#ff9e3b',
  ['--hermes-diag-error' as string]:    '#ff6b3d',
  ['--hermes-diag-critical' as string]: '#ff4d4d',
}
