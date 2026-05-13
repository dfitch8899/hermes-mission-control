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

    let pollId:    ReturnType<typeof setInterval> | null = null
    let timeoutId: ReturnType<typeof setTimeout>  | null = null
    let listener:  ((e: Event) => void)           | null = null

    const promote = (): boolean => {
      const Plugin = getRegisteredHermesPlugin('kanban')
      if (!Plugin) return false
      if (mounted.current) setState({ kind: 'ready', Plugin })
      return true
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

      // Belt-and-suspenders: listen for the custom event AND poll the
      // registry. The poll catches React StrictMode double-mounts where the
      // event fires between mount#1's cleanup and mount#2's listener
      // attachment — a race the event alone can lose.
      listener = () => { if (promote() && pollId) { clearInterval(pollId); pollId = null } }
      window.addEventListener('hermes-plugin-registered', listener)

      pollId = setInterval(() => {
        if (!mounted.current) {
          if (pollId) { clearInterval(pollId); pollId = null }
          return
        }
        if (promote() && pollId) { clearInterval(pollId); pollId = null }
      }, 200)

      timeoutId = setTimeout(() => {
        if (pollId) { clearInterval(pollId); pollId = null }
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
      if (pollId)    clearInterval(pollId)
      if (timeoutId) clearTimeout(timeoutId)
      if (listener)  window.removeEventListener('hermes-plugin-registered', listener)
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
        style={{ ...HERMES_THEME_VARS, background: 'transparent' }}
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

      /* ─────────────────────────────────────────────────────────────────
       * SDK primitives — Liquid Glass surfaces. The SDK shim renders bare
       * .hermes-sdk-* class names; all styling lives here so it can pick
       * up CSS vars and backdrop-filter without inlining via Tailwind.
       * Scoped to .hermes-kanban-host so it can't leak.
       * ───────────────────────────────────────────────────────────────── */

      /* Card — translucent panel with soft inner highlight */
      .hermes-kanban-host .hermes-sdk-card {
        background: color-mix(in srgb, var(--color-card) 88%, transparent);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        box-shadow:
          0 4px 14px -8px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
        color: var(--color-foreground);
        backdrop-filter: blur(8px) saturate(140%);
        -webkit-backdrop-filter: blur(8px) saturate(140%);
      }
      .hermes-kanban-host .hermes-sdk-card-content {
        padding: 0.875rem 1rem;
      }

      /* Badge — soft pill, mono lowercase id-looking text fits this well */
      .hermes-kanban-host .hermes-sdk-badge {
        display: inline-flex;
        align-items: center;
        border-radius: 9999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.05);
        padding: 1px 8px;
        font-size: 10.5px;
        line-height: 1.5;
        color: var(--color-muted-foreground);
        font-family: var(--font-mono);
        letter-spacing: 0.02em;
      }

      /* Button — glass-tinted; cyan accent ring on hover */
      .hermes-kanban-host .hermes-sdk-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        height: 30px;
        padding: 0 12px;
        border-radius: var(--radius-sm);
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.04);
        color: var(--color-foreground);
        font-size: 13px;
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        transition:
          background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
          border-color     160ms cubic-bezier(0.23, 1, 0.32, 1),
          color            160ms cubic-bezier(0.23, 1, 0.32, 1),
          box-shadow       160ms cubic-bezier(0.23, 1, 0.32, 1),
          scale             80ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      .hermes-kanban-host .hermes-sdk-button:hover:not(:disabled) {
        background: rgba(60, 215, 255, 0.10);
        border-color: rgba(60, 215, 255, 0.30);
        color: #cdf5ff;
        box-shadow:
          0 0 0 1px rgba(60, 215, 255, 0.20) inset,
          0 4px 14px -6px rgba(60, 215, 255, 0.20);
      }
      .hermes-kanban-host .hermes-sdk-button:active:not(:disabled) {
        scale: 0.96;
      }
      .hermes-kanban-host .hermes-sdk-button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      /* Inputs / Selects — same glass treatment as buttons for visual harmony */
      .hermes-kanban-host .hermes-sdk-input,
      .hermes-kanban-host .hermes-sdk-select {
        height: 30px;
        padding: 0 10px;
        border-radius: var(--radius-sm);
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(13, 19, 35, 0.55);
        color: var(--color-foreground);
        font-size: 13px;
        line-height: 1;
        outline: none;
        transition:
          background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
          border-color     160ms cubic-bezier(0.23, 1, 0.32, 1),
          box-shadow       160ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      .hermes-kanban-host .hermes-sdk-input:focus,
      .hermes-kanban-host .hermes-sdk-select:focus {
        border-color: rgba(60, 215, 255, 0.35);
        box-shadow: 0 0 0 3px rgba(60, 215, 255, 0.12);
      }
      .hermes-kanban-host .hermes-sdk-input::placeholder {
        color: rgba(187, 201, 207, 0.4);
      }
      .hermes-kanban-host .hermes-sdk-select option {
        background: #151b2c;
        color: var(--color-foreground);
      }

      .hermes-kanban-host .hermes-sdk-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--color-muted-foreground);
        font-family: var(--font-mono);
      }

      /* ─────────────────────────────────────────────────────────────────
       * Task card detail tweaks — make the card body breathe + tabular IDs
       * ───────────────────────────────────────────────────────────────── */
      .hermes-kanban-host .hermes-kanban-card-id {
        font-family: var(--font-mono);
        font-variant-numeric: tabular-nums;
        font-size: 10.5px;
        color: var(--color-muted-foreground);
        letter-spacing: 0.02em;
      }
      .hermes-kanban-host .hermes-kanban-card-title {
        font-size: 13.5px;
        font-weight: 500;
        color: var(--color-foreground);
        line-height: 1.35;
        text-wrap: pretty;
        margin-top: 4px;
      }
      .hermes-kanban-host .hermes-kanban-card-meta {
        font-size: 11px;
        color: var(--color-muted-foreground);
        margin-top: 6px;
      }
      .hermes-kanban-host .hermes-kanban-unassigned {
        font-style: italic;
        color: rgba(187, 201, 207, 0.55);
      }
      .hermes-kanban-host .hermes-kanban-ago {
        font-variant-numeric: tabular-nums;
        font-family: var(--font-mono);
        font-size: 10.5px;
      }

      /* Cards that have a stale-red signal — soften the indicator */
      .hermes-kanban-host .hermes-kanban-card--stale-red .hermes-sdk-card {
        border-color: rgba(255, 180, 171, 0.35);
        box-shadow:
          0 4px 14px -8px rgba(255, 107, 61, 0.18),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }

      /* ─────────────────────────────────────────────────────────────────
       * Drawer (task detail panel) — full glass treatment + readable type
       * ───────────────────────────────────────────────────────────────── */
      .hermes-kanban-drawer {
        background: rgba(13, 19, 35, 0.75) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
        border-left: 1px solid rgba(255, 255, 255, 0.08) !important;
        box-shadow:
          -12px 0 40px -16px rgba(0, 0, 0, 0.5),
          inset 1px 0 0 rgba(255, 255, 255, 0.04) !important;
        color: var(--color-foreground);
      }
      .hermes-kanban-drawer-shade {
        background: rgba(8, 14, 29, 0.55) !important;
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
      }

      /* Drawer typography — replace any hard-black surfaces inside it */
      .hermes-kanban-drawer .hermes-sdk-card {
        background: rgba(255, 255, 255, 0.03) !important;
        border: 1px solid rgba(255, 255, 255, 0.06) !important;
      }
      .hermes-kanban-drawer pre,
      .hermes-kanban-drawer code {
        background: rgba(255, 255, 255, 0.04) !important;
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 6px;
        color: rgba(221, 226, 249, 0.92);
        font-family: var(--font-mono);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      .hermes-kanban-drawer pre {
        padding: 10px 12px;
        line-height: 1.55;
        overflow-x: auto;
      }
      .hermes-kanban-drawer-head {
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        padding: 12px 18px !important;
      }
      .hermes-kanban-drawer-title {
        font-size: 15px;
        font-weight: 500;
        text-wrap: balance;
      }
      .hermes-kanban-drawer-title-text {
        color: var(--color-foreground);
      }
      .hermes-kanban-drawer-meta {
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--color-muted-foreground);
        font-variant-numeric: tabular-nums;
      }
      .hermes-kanban-drawer-body {
        padding: 14px 18px !important;
      }

      /* Section headers inside the drawer — "DESCRIPTION", "DEPENDENCIES", etc. */
      .hermes-kanban-drawer h2,
      .hermes-kanban-drawer h3,
      .hermes-kanban-drawer .hermes-kanban-drawer-section-title,
      .hermes-kanban-drawer [class*="-section-title"],
      .hermes-kanban-drawer [class*="-section-head"] {
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: rgba(60, 215, 255, 0.8);
        margin: 16px 0 8px;
      }

      /* Comments + events list rows — outer rows ONLY, not their children.
       * The plugin nests each row with -head/-author/-ago etc. sub-elements
       * that would otherwise pick up the same border treatment. */
      .hermes-kanban-drawer .hermes-kanban-drawer-comment-row,
      .hermes-kanban-drawer > .hermes-kanban-drawer-body .hermes-kanban-event,
      .hermes-kanban-drawer > .hermes-kanban-drawer-body .hermes-kanban-comment,
      .hermes-kanban-drawer > .hermes-kanban-drawer-body .hermes-kanban-run {
        border-radius: var(--radius-sm);
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.04);
        padding: 8px 10px;
        margin-bottom: 6px;
        font-size: 12.5px;
        line-height: 1.45;
        color: rgba(221, 226, 249, 0.92);
      }

      /* Sub-elements explicitly opt OUT of the row border — they paint
       * their own typography directly on the row's surface. */
      .hermes-kanban-drawer .hermes-kanban-comment > *,
      .hermes-kanban-drawer .hermes-kanban-event > *,
      .hermes-kanban-drawer .hermes-kanban-run > * {
        background: transparent;
        border: none;
        padding: 0;
        margin: 0;
      }
      .hermes-kanban-drawer .hermes-kanban-comment-head,
      .hermes-kanban-drawer .hermes-kanban-event-header-plain,
      .hermes-kanban-drawer .hermes-kanban-run-head {
        display: flex;
        gap: 8px;
        align-items: baseline;
        font-size: 11px;
        color: var(--color-muted-foreground);
        font-family: var(--font-mono);
        margin-bottom: 4px;
      }
      .hermes-kanban-drawer .hermes-kanban-event-kind,
      .hermes-kanban-drawer .hermes-kanban-run-outcome {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 600;
      }

      /* Close button — make it actually look like a control, not a glyph */
      .hermes-kanban-drawer .hermes-kanban-drawer-close {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        color: var(--color-muted-foreground);
        transition: background-color 120ms, color 120ms;
      }
      .hermes-kanban-drawer .hermes-kanban-drawer-close:hover {
        background: rgba(255, 107, 61, 0.1);
        color: #ffb4ab;
        border-color: rgba(255, 107, 61, 0.25);
      }

      /* Diagnostics callout — outer container only (the plugin nests
       * .hermes-kanban-diag-header / -sev / -title / -detail / etc., so
       * a wildcard would paint the border on every nested element). */
      .hermes-kanban-drawer .hermes-kanban-diag {
        background: rgba(255, 158, 59, 0.08);
        border: 1px solid rgba(255, 158, 59, 0.25);
        border-radius: var(--radius-sm);
        padding: 10px 12px;
        margin-bottom: 6px;
      }
      .hermes-kanban-drawer .hermes-kanban-diag--error {
        background: rgba(255, 107, 61, 0.08);
        border-color: rgba(255, 107, 61, 0.3);
      }
      .hermes-kanban-drawer .hermes-kanban-diag > * {
        background: transparent;
        border: none;
      }

      /* Status pill at the top of the drawer */
      .hermes-kanban-drawer [class*="-status"] [class*="-pill"],
      .hermes-kanban-drawer [class*="status-pill"] {
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-size: 10.5px;
        padding: 2px 8px;
        border-radius: 9999px;
      }

      /* Top-level toolbar pill ("X tasks need attention" banner) — outer
       * container ONLY. The banner nests a -bar (background), -icon,
       * -text, -toggle button, and -dismiss button; previously each got
       * the amber border so it read as nested boxes. */
      .hermes-kanban-host .hermes-kanban-attention {
        background: rgba(255, 158, 59, 0.08);
        border: 1px solid rgba(255, 158, 59, 0.28);
        border-radius: var(--radius-sm);
        padding: 6px 10px;
      }
      .hermes-kanban-host .hermes-kanban-attention--error {
        background: rgba(255, 107, 61, 0.10);
        border-color: rgba(255, 107, 61, 0.32);
      }
      /* Inner bar/icon/text are background-only rows — no border, no
       * own radius. They paint over the outer banner's surface. */
      .hermes-kanban-host .hermes-kanban-attention-bar {
        background: transparent;
        border: none;
        padding: 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .hermes-kanban-host .hermes-kanban-attention-icon {
        background: transparent;
        border: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #ff9e3b;
      }
      .hermes-kanban-host .hermes-kanban-attention-text {
        background: transparent;
        border: none;
        color: rgba(221, 226, 249, 0.92);
        font-size: 12.5px;
      }
      /* "Show" / "×" controls in the banner — small glass buttons, not
       * amber-bordered. */
      .hermes-kanban-host .hermes-kanban-attention-toggle,
      .hermes-kanban-host .hermes-kanban-attention-dismiss {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: var(--color-muted-foreground);
        border-radius: 6px;
        padding: 2px 10px;
        font-size: 12px;
        line-height: 1.4;
        transition: background-color 120ms, border-color 120ms, color 120ms;
      }
      .hermes-kanban-host .hermes-kanban-attention-dismiss {
        padding: 0;
        width: 26px;
        height: 26px;
      }
      .hermes-kanban-host .hermes-kanban-attention-toggle:hover,
      .hermes-kanban-host .hermes-kanban-attention-dismiss:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.14);
        color: var(--color-foreground);
      }

      /* Markdown bodies / rendered task descriptions */
      .hermes-kanban-host .hermes-kanban-md,
      .hermes-kanban-drawer .hermes-kanban-md {
        font-size: 13.5px;
        line-height: 1.6;
        color: rgba(221, 226, 249, 0.92);
        text-wrap: pretty;
      }
      .hermes-kanban-host .hermes-kanban-md a {
        color: #3cd7ff;
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      /* "+ New board" and similar accent buttons */
      .hermes-kanban-host .hermes-kanban-board-add,
      .hermes-kanban-host [class*="-board-add"],
      .hermes-kanban-host [class*="-add-button"] {
        background: rgba(60, 215, 255, 0.10);
        border: 1px solid rgba(60, 215, 255, 0.25);
        color: #cdf5ff;
      }
      .hermes-kanban-host .hermes-kanban-board-add:hover,
      .hermes-kanban-host [class*="-board-add"]:hover,
      .hermes-kanban-host [class*="-add-button"]:hover {
        background: rgba(60, 215, 255, 0.18);
        border-color: rgba(60, 215, 255, 0.45);
      }

      /* Column add button (the "+" / "×" inside each column header).
       *
       * - cursor:pointer so it feels interactive (Tailwind reset removes
       *   the default button cursor).
       * - Visible 22×22 box but a ::before pseudo extends the hit area
       *   to 40×40 (make-interfaces-feel-better minimum). Pointer events
       *   on the pseudo travel to the parent <button>. */
      .hermes-kanban-host .hermes-kanban-column-add {
        position: relative;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: var(--color-muted-foreground);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        transition:
          background-color 120ms cubic-bezier(0.23, 1, 0.32, 1),
          color 120ms cubic-bezier(0.23, 1, 0.32, 1),
          border-color 120ms cubic-bezier(0.23, 1, 0.32, 1),
          scale 80ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      .hermes-kanban-host .hermes-kanban-column-add::before {
        content: '';
        position: absolute;
        inset: -9px;   /* 22 + 18 = 40 → 40×40 hit area */
        border-radius: 12px;
      }
      .hermes-kanban-host .hermes-kanban-column-add:hover {
        background: rgba(60, 215, 255, 0.14);
        color: #cdf5ff;
        border-color: rgba(60, 215, 255, 0.32);
      }
      .hermes-kanban-host .hermes-kanban-column-add:active {
        scale: 0.96;
      }

      /* ─────────────────────────────────────────────────────────────────
       * Inline create-task form (the popover that appears below the
       * column header when you click "+"). The plugin's textarea uses
       * shadcn-style classes (border-input, focus:ring-ring,
       * bg-transparent) that are NOT in MC's tailwind config, so the
       * textarea would otherwise render unstyled and the form looks
       * "bugged". Style it explicitly here as a glass mini-panel.
       * ───────────────────────────────────────────────────────────────── */
      .hermes-kanban-host .hermes-kanban-inline-create {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 8px 0;
        padding: 10px;
        border: 1px solid rgba(60, 215, 255, 0.18);
        border-radius: var(--radius);
        background: rgba(60, 215, 255, 0.04);
        box-shadow:
          0 4px 14px -8px rgba(0, 0, 0, 0.35),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }
      .hermes-kanban-host .hermes-kanban-inline-create > .flex {
        display: flex;
        gap: 8px;
        align-items: stretch;
      }
      .hermes-kanban-host .hermes-kanban-inline-create textarea {
        width: 100%;
        min-height: 56px;
        max-height: 160px;
        resize: vertical;
        padding: 8px 10px;
        background: rgba(13, 19, 35, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: var(--radius-sm);
        color: var(--color-foreground);
        font-size: 13px;
        line-height: 1.45;
        font-family: var(--font-body, var(--font-inter, system-ui));
        outline: none;
        transition: border-color 160ms, box-shadow 160ms, background-color 160ms;
      }
      .hermes-kanban-host .hermes-kanban-inline-create textarea:focus {
        border-color: rgba(60, 215, 255, 0.35);
        background: rgba(13, 19, 35, 0.7);
        box-shadow: 0 0 0 3px rgba(60, 215, 255, 0.12);
      }
      .hermes-kanban-host .hermes-kanban-inline-create textarea::placeholder {
        color: rgba(187, 201, 207, 0.4);
        font-style: italic;
      }
      .hermes-kanban-host .hermes-kanban-inline-create .hermes-sdk-input,
      .hermes-kanban-host .hermes-kanban-inline-create .hermes-sdk-select {
        height: 28px;
        font-size: 12px;
        padding: 0 8px;
      }
      /* Override the plugin's hardcoded w-16 px width on the priority input
       * so it doesn't shrink to a tiny box that overlaps "specifier". */
      .hermes-kanban-host .hermes-kanban-inline-create .hermes-sdk-input.w-16 {
        width: 64px;
        flex-shrink: 0;
      }
      /* Primary action button (Create) — cyan accent */
      .hermes-kanban-host .hermes-kanban-inline-create > .flex:last-child .hermes-sdk-button:first-child {
        background: rgba(60, 215, 255, 0.14);
        border-color: rgba(60, 215, 255, 0.32);
        color: #cdf5ff;
      }
      .hermes-kanban-host .hermes-kanban-inline-create > .flex:last-child .hermes-sdk-button:first-child:hover {
        background: rgba(60, 215, 255, 0.22);
        border-color: rgba(60, 215, 255, 0.48);
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
