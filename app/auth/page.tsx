'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, KeyRound, ExternalLink, AlertTriangle, RefreshCw, Terminal } from 'lucide-react'
import TopAppBar from '@/components/layout/TopAppBar'

/**
 * Hermes Auth helper page.
 *
 * Drives `hermes auth` on the container via /api/hermes/auth (which proxies
 * to mc_proxy's exec endpoint). The output is captured and surfaced here.
 *
 * Pragmatic UX: mc_proxy's exec runs with stdin=DEVNULL + 30 s timeout, so
 * the in-MC flow can capture the URL Hermes prints first, but may not be
 * able to complete the device handshake if Hermes blocks waiting for a
 * callback. The "fallback" section makes the ECS-exec escape hatch
 * explicit so the user is never stuck.
 *
 * The "right" full-in-MC flow needs a multi-step endpoint on mc_proxy
 * (start → URL, poll → completion). Tracked as TODO; not in this PR.
 */
export default function HermesAuthPage() {
  const [output,  setOutput]  = useState<string>('')
  const [error,   setError]   = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const runAuth = useCallback(async (command: string) => {
    if (running) return
    setRunning(true)
    setError(null)
    try {
      const res  = await fetch('/api/hermes/auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ command }),
      })
      const data = await res.json() as { output?: string; error?: string }
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
        return
      }
      setOutput(data.output ?? '')
    } catch (err) {
      setError(String(err))
    } finally {
      setRunning(false)
    }
  }, [running])

  // Pull every URL out of the captured output so we can render them as
  // clickable links rather than buried plain text. The device-code flow
  // typically prints one URL; the regex is generous to handle other
  // cases (e.g. callback URLs, doc links).
  const urls = output
    ? Array.from(new Set(output.match(/https?:\/\/[^\s\]\)"'`]+/g) ?? []))
    : []

  // Heuristic check for whether output suggests auth is still missing.
  // Used to colour the result banner and to nudge the user toward the
  // fallback path when in-MC completion looks unlikely.
  const looksUnauthenticated = /No Codex credentials|Run `hermes auth`|not authenticated/i.test(output)
  const looksAuthenticated   = /already authenticated|credentials.*stored|authentication.*successful/i.test(output)

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <TopAppBar breadcrumb={['Hermes', 'Auth']} />

      <div className="flex-1 overflow-y-auto p-6 space-y-5" style={{ position: 'relative', zIndex: 2 }}>
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
              <KeyRound size={14} style={{ color: '#c084fc' }} />
              <span className="text-[13px] font-mono text-on-surface">Hermes Auth</span>
            </div>
          </div>
        </div>

        {/* Explainer */}
        <div
          className="rounded-xl px-5 py-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(221,226,249,0.8)' }}>
            Hermes runs every chat through a Codex-backed model. If the container
            has no stored credentials, workers exit cleanly without calling
            <code className="px-1 mx-0.5 rounded" style={{ background: 'rgba(133,147,152,0.15)', color: '#dde2f9' }}>kanban_complete</code>
            — which the dispatcher treats as a protocol violation and the
            task ends up parked.
          </p>
          <p className="text-[11px] leading-relaxed mt-2" style={{ color: 'rgba(133,147,152,0.7)' }}>
            Click <strong>Start auth</strong>. If a URL appears below, open it in your
            browser, complete the sign-in, then click <strong>Recheck</strong>.
          </p>
        </div>

        {/* Primary actions */}
        <div className="flex gap-2">
          <button
            onClick={() => void runAuth('auth')}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-mono font-semibold transition-all"
            style={{
              background: running
                ? 'rgba(192,132,252,0.12)'
                : 'linear-gradient(135deg, rgba(192,132,252,0.15), rgba(167,139,250,0.15))',
              border: '1px solid rgba(192,132,252,0.3)',
              color:  '#c084fc',
              cursor: running ? 'wait' : 'pointer',
              opacity: running ? 0.7 : 1,
            }}
          >
            <KeyRound size={13} />
            {running ? 'Running…' : 'Start auth'}
          </button>
          <button
            onClick={() => void runAuth('auth')}
            disabled={running || !output}
            title="Re-run hermes auth — useful after completing the browser flow"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-mono font-medium transition-all"
            style={{
              background: 'rgba(60,215,255,0.08)',
              border: '1px solid rgba(60,215,255,0.2)',
              color:  '#3cd7ff',
              cursor: (running || !output) ? 'not-allowed' : 'pointer',
              opacity: (running || !output) ? 0.5 : 1,
            }}
          >
            <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
            Recheck
          </button>
        </div>

        {/* URL surface — make any URL in the output big and obvious. */}
        {urls.length > 0 && (
          <div
            className="rounded-xl px-5 py-4 space-y-2"
            style={{
              background: looksAuthenticated
                ? 'rgba(93,246,224,0.06)'
                : 'rgba(192,132,252,0.06)',
              border: looksAuthenticated
                ? '1px solid rgba(93,246,224,0.25)'
                : '1px solid rgba(192,132,252,0.25)',
            }}
          >
            <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#c084fc' }}>
              {looksAuthenticated ? 'Auth links' : 'Open this URL to sign in'}
            </div>
            {urls.map(url => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-2 text-[12px] font-mono break-all transition-colors duration-200"
                style={{ color: '#c084fc' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#dde2f9' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#c084fc' }}
              >
                <ExternalLink size={12} className="shrink-0" />
                {url}
              </a>
            ))}
          </div>
        )}

        {/* Error banner — transport-level failures (5xx, 403, etc). */}
        {error && (
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-3"
            style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)' }}
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: '#f97316' }} />
            <div>
              <div className="text-[12px] font-mono font-medium" style={{ color: '#f97316' }}>Auth command failed</div>
              <div className="text-[11px] font-mono mt-1" style={{ color: 'rgba(249,115,22,0.8)' }}>{error}</div>
            </div>
          </div>
        )}

        {/* Raw output dump — useful for diagnosing what Hermes actually said. */}
        {output && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Terminal size={11} style={{ color: '#859398' }} />
              <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#859398' }}>
                Captured output
              </span>
              {looksAuthenticated && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(93,246,224,0.1)', border: '1px solid rgba(93,246,224,0.25)', color: '#5df6e0' }}>
                  authenticated
                </span>
              )}
              {looksUnauthenticated && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', color: '#f97316' }}>
                  not yet authenticated
                </span>
              )}
            </div>
            <pre
              className="rounded-xl p-4 overflow-x-auto text-[11px] leading-relaxed font-mono whitespace-pre-wrap"
              style={{
                background: 'rgba(13,19,35,0.6)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: '#dde2f9',
                maxHeight: 360,
                overflowY: 'auto',
              }}
            >
              {output || '<empty>'}
            </pre>
          </div>
        )}

        {/* Fallback — if the in-MC flow can't complete the device handshake. */}
        <div
          className="rounded-xl px-5 py-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Terminal size={11} style={{ color: '#859398' }} />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#859398' }}>
              Fallback: ECS-exec
            </span>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(133,147,152,0.85)' }}>
            mc_proxy runs <code className="px-1 rounded" style={{ background: 'rgba(133,147,152,0.15)', color: '#dde2f9' }}>hermes auth</code> with
            stdin disabled and a 30 s timeout. If the device flow needs to
            complete a callback after that window, you&apos;ll need to run it directly on the
            container:
          </p>
          <pre
            className="mt-2 rounded-lg px-3 py-2 text-[11px] font-mono overflow-x-auto"
            style={{ background: 'rgba(13,19,35,0.6)', border: '1px solid rgba(255,255,255,0.06)', color: '#dde2f9' }}
          >
{`aws ecs execute-command \\
  --cluster hermes \\
  --task <task-arn> \\
  --container hermes \\
  --interactive \\
  --command "hermes auth"`}
          </pre>
          <p className="text-[10px] mt-2 font-mono" style={{ color: 'rgba(133,147,152,0.6)' }}>
            Once the container has credentials, come back and click <strong>Recheck</strong>.
            Then on a parked task, hit <strong>Retry</strong> in the log viewer.
          </p>
        </div>
      </div>
    </div>
  )
}
