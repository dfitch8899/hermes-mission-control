'use client'

import { AlertTriangle, RefreshCw, Terminal } from 'lucide-react'

export default function NativeKanbanUnavailable() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="max-w-2xl w-full rounded-lg border border-amber-500/40 bg-zinc-900 p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="h-6 w-6 text-amber-400" />
          <h1 className="text-2xl font-semibold">Hermes kanban is unreachable</h1>
        </div>

        <p className="text-zinc-300 mb-6">
          Mission Control&apos;s <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm">/kanban</code> route
          hosts the native Hermes board. There is no legacy fallback here — fix the connection
          and the board will appear.
        </p>

        <div className="space-y-5">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-2">
              Required environment
            </h2>
            <ul className="space-y-1 text-sm">
              <li>
                <code className="rounded bg-zinc-800 px-1.5 py-0.5">HERMES_DASHBOARD_URL</code>
                <span className="ml-2 text-zinc-400">
                  e.g. <code>http://127.0.0.1:9120</code> (the local port-forward)
                </span>
              </li>
              <li>
                <code className="rounded bg-zinc-800 px-1.5 py-0.5">HERMES_SECRET_KEY</code>
                <span className="ml-2 text-zinc-400">
                  must match the Hermes container&apos;s value
                </span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-2 flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Open the tunnel
            </h2>
            <p className="text-sm text-zinc-300 mb-2">
              In a separate PowerShell, run the AWS Session Manager port-forward:
            </p>
            <pre className="rounded bg-black/60 border border-zinc-800 p-3 text-xs text-emerald-300 overflow-x-auto">
              pwsh scripts/hermes-forward.ps1
            </pre>
            <p className="text-xs text-zinc-500 mt-2">
              Requires AWS CLI v2 and the Session Manager Plugin.
            </p>
          </section>
        </div>

        <button
          onClick={() => location.reload()}
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    </div>
  )
}
