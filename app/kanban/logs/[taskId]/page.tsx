'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, AlertTriangle, FileText } from 'lucide-react'
import TopAppBar from '@/components/layout/TopAppBar'
import type { KanbanTaskLog } from '@/lib/hermesClient.types'

/**
 * Worker-log viewer.
 *
 * Reads /api/kanban/{taskId}/log, which proxies to the Hermes plugin's
 * /api/plugins/kanban/tasks/{id}/log. Designed for diagnosing the
 * "worker exited rc=0 without calling kanban_complete/kanban_block"
 * protocol violation — that crash signal hides the actual cause, which
 * is always somewhere in the worker's own stdout/stderr.
 *
 * `exists: false` is a real response shape (task never spawned a worker);
 * render an explanatory empty state instead of an error.
 */
export default function WorkerLogPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = use(params)
  const [log,    setLog]    = useState<KanbanTaskLog | null>(null)
  const [error,  setError]  = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tailKb, setTailKb] = useState<number>(64)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const tailBytes = tailKb > 0 ? tailKb * 1024 : undefined
      const qs = new URLSearchParams()
      if (tailBytes) qs.set('tail', String(tailBytes))
      const res  = await fetch(`/api/kanban/${taskId}/log${qs.toString() ? `?${qs}` : ''}`)
      const data = await res.json() as KanbanTaskLog & { error?: string }
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
        return
      }
      setLog(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [taskId, tailKb])

  useEffect(() => { void load() }, [load])

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <TopAppBar breadcrumb={['Hermes', 'Kanban', 'Worker Log']} />

      <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ position: 'relative', zIndex: 2 }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest transition-colors duration-200"
              style={{ color: '#859398' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#3cd7ff' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#859398' }}
            >
              <ArrowLeft size={12} /> Overview
            </Link>
            <span className="text-outline">/</span>
            <div className="flex items-center gap-2">
              <FileText size={14} style={{ color: '#3cd7ff' }} />
              <span className="text-[13px] font-mono text-on-surface">{taskId}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-outline">Tail</label>
            <select
              value={tailKb}
              onChange={e => setTailKb(Number(e.target.value))}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#dde2f9',
                fontSize: 11,
                padding: '4px 8px',
                outline: 'none',
              }}
            >
              <option value={16}>16 KB</option>
              <option value={64}>64 KB</option>
              <option value={256}>256 KB</option>
              <option value={1024}>1 MB</option>
              <option value={0}>Full</option>
            </select>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all"
              style={{
                background: 'rgba(60,215,255,0.1)',
                border: '1px solid rgba(60,215,255,0.25)',
                color: '#3cd7ff',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Status row */}
        {log && !error && (
          <div
            className="rounded-xl px-4 py-2.5 flex items-center justify-between text-[11px] font-mono"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-4">
              <span className="text-outline">Path</span>
              <span className="text-on-surface truncate" style={{ maxWidth: 600 }}>{log.path}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-outline">Size</span>
              <span className="text-on-surface">{(log.size_bytes / 1024).toFixed(1)} KB</span>
              {log.truncated && (
                <span style={{ color: '#f97316' }}>(truncated)</span>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-3"
            style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)' }}
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: '#f97316' }} />
            <div>
              <div className="text-[12px] font-mono font-medium" style={{ color: '#f97316' }}>Failed to load worker log</div>
              <div className="text-[11px] font-mono mt-1" style={{ color: 'rgba(249,115,22,0.8)' }}>{error}</div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!error && log && !log.exists && (
          <div
            className="rounded-xl px-4 py-6 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="text-[12px] font-mono text-outline">
              No worker log on disk for this task yet.
            </div>
            <div className="text-[10px] font-mono mt-1.5" style={{ color: 'rgba(133,147,152,0.6)' }}>
              Tasks only get a log once a worker has been dispatched (status → running).
            </div>
          </div>
        )}

        {/* Log content */}
        {!error && log && log.exists && (
          <pre
            className="rounded-xl p-4 overflow-x-auto text-[11px] leading-relaxed font-mono whitespace-pre-wrap"
            style={{
              background: 'rgba(13,19,35,0.6)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: '#dde2f9',
              maxHeight: 'calc(100vh - 280px)',
              overflowY: 'auto',
            }}
          >
            {log.content || '<empty>'}
          </pre>
        )}

        {/* Initial loading skeleton */}
        {loading && !log && !error && (
          <div className="text-[11px] font-mono text-outline">Loading worker log…</div>
        )}
      </div>
    </div>
  )
}
