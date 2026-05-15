'use client'

import { useState, useEffect, useRef } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import AgentCard from '@/components/agents/AgentCard'
import AgentEditor from '@/components/agents/AgentEditor'
import { Plus } from 'lucide-react'
import type { Agent } from '@/types/agent'
import { invalidateAgentsCache } from '@/lib/agents-client'

type SyncStatus = {
  ok: boolean
  status: 'reachable' | 'auth_blocked' | 'transport_disabled' | 'network_error'
  detail?: string
  httpStatus?: number
}

export default function AgentsPage() {
  const [agents,       setAgents]       = useState<Agent[]>([])
  const [usage,        setUsage]        = useState<Record<string, number>>({})
  const [loading,      setLoading]      = useState(true)
  const [editorOpen,   setEditorOpen]   = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null) // null = create new; non-null without agentId = duplicate
  const [syncStatus,   setSyncStatus]   = useState<SyncStatus | null>(null)
  const seeded = useRef(false)

  // Seed built-in agents on first load, then fetch list + usage + sync status
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    fetch('/api/agents/seed', { method: 'POST' })
      .catch(() => {})
      .finally(() => { loadAgents(); loadUsage(); loadSyncStatus() })
  }, [])

  function loadSyncStatus() {
    fetch('/api/hermes/profile-sync/status')
      .then(r => r.json())
      .then(d => setSyncStatus(d))
      .catch(() => setSyncStatus({ ok: false, status: 'network_error' }))
  }

  function loadAgents() {
    setLoading(true)
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => setAgents(d.agents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  function loadUsage() {
    fetch('/api/agents/usage')
      .then(r => r.json())
      .then(d => setUsage(d.counts ?? {}))
      .catch(() => {})
  }

  const openCreate    = () => { setEditingAgent(null); setEditorOpen(true) }
  const openEdit      = (a: Agent) => { setEditingAgent(a); setEditorOpen(true) }
  /** Duplicate: open editor pre-filled from `a` but with no agentId, so Save creates a new agent. */
  const openDuplicate = (a: Agent) => {
    const template: Agent = {
      ...a,
      agentId:     '',
      name:        `${a.name} Copy`,
      isBuiltin:   false,
      createdAt:   '',
      updatedAt:   '',
    }
    setEditingAgent(template); setEditorOpen(true)
  }

  const handleDelete = async (agent: Agent) => {
    const count = usage[agent.agentId] ?? 0
    const msg = count > 0
      ? `Delete agent "${agent.name}"? It's assigned to ${count} open task${count === 1 ? '' : 's'} — they will fall back to the generic icon/color.`
      : `Delete agent "${agent.name}"?`
    if (!confirm(msg)) return
    const res = await fetch(`/api/agents/${agent.agentId}`, { method: 'DELETE' })
    if (res.ok) {
      setAgents(prev => prev.filter(a => a.agentId !== agent.agentId))
      invalidateAgentsCache()
    } else {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Delete failed')
    }
  }

  const handleSaved = (saved: Agent) => {
    setAgents(prev => {
      const idx = prev.findIndex(a => a.agentId === saved.agentId)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = saved; return next
      }
      return [...prev, saved].sort((a, b) => {
        if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    })
    invalidateAgentsCache()
    setEditorOpen(false)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Subtle background */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 60% 10%, rgba(60,215,255,0.04) 0%, transparent 60%)', zIndex: 0 }} />

      <TopAppBar breadcrumb={['Hermes', 'Agents']} />

      {/* Subheader */}
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ position: 'relative', zIndex: 2, borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(13,19,35,0.5)' }}
      >
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-mono uppercase tracking-widest text-outline">
            {agents.length} agents
          </span>
          {!loading && (
            <>
              <span className="text-outline text-[11px]">·</span>
              <span className="text-[11px] font-mono" style={{ color: '#3cd7ff' }}>
                {agents.filter(a => a.isBuiltin).length} built-in
              </span>
            </>
          )}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'rgba(60,215,255,0.12)', color: '#3cd7ff', border: '1px solid rgba(60,215,255,0.25)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(60,215,255,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(60,215,255,0.12)')}
        >
          <Plus size={14} />
          New Agent
        </button>
      </div>

      {/* Hermes sync status banner */}
      {syncStatus && syncStatus.status !== 'reachable' && (
        <div
          className="px-6 py-2.5 shrink-0 flex items-center gap-3 text-[11px] font-mono"
          style={{
            position: 'relative', zIndex: 2,
            background: syncStatus.status === 'auth_blocked' ? 'rgba(249,115,22,0.06)' : 'rgba(133,147,152,0.05)',
            borderBottom: '1px solid rgba(249,115,22,0.15)',
            color: '#f97316',
          }}
        >
          <span style={{ fontSize: 12 }}>⚠</span>
          <span style={{ flex: 1 }}>
            {syncStatus.status === 'auth_blocked' && (
              <>Hermes profile sync is <b>auth-blocked</b> (HTTP {syncStatus.httpStatus}). The Hermes container needs <code style={{ background:'rgba(255,255,255,0.06)', padding:'1px 5px', borderRadius:4 }}>mc_proxy.py</code> with the <code style={{ background:'rgba(255,255,255,0.06)', padding:'1px 5px', borderRadius:4 }}>/api/mc/profile-soul</code> bridge (task def rev ≥ 51). See <code style={{ background:'rgba(255,255,255,0.06)', padding:'1px 5px', borderRadius:4 }}>docs/hermes-profile-sync.md</code>.</>
            )}
            {syncStatus.status === 'transport_disabled' && (
              <>Hermes profile sync is <b>off</b>: <code style={{ background:'rgba(255,255,255,0.06)', padding:'1px 5px', borderRadius:4 }}>HERMES_TRANSPORT</code> is not <code style={{ background:'rgba(255,255,255,0.06)', padding:'1px 5px', borderRadius:4 }}>direct</code>. Agent edits stay MC-local.</>
            )}
            {syncStatus.status === 'network_error' && (
              <>Hermes profile sync unreachable: {syncStatus.detail || 'network error'}. Agent edits stay MC-local.</>
            )}
          </span>
          <button onClick={loadSyncStatus} style={{ color: '#f97316', textDecoration: 'underline', opacity: 0.8 }}>recheck</button>
        </div>
      )}
      {syncStatus?.status === 'reachable' && (
        <div
          className="px-6 py-2 shrink-0 flex items-center gap-3 text-[10px] font-mono"
          style={{ position: 'relative', zIndex: 2, background: 'rgba(74,222,128,0.04)', borderBottom: '1px solid rgba(74,222,128,0.12)', color: '#4ade80' }}
        >
          <span style={{ fontSize: 11 }}>✓</span>
          <span>Hermes profile sync active — your agent&apos;s system prompt is applied on every chat (verified end-to-end)</span>
        </div>
      )}

      {/* Agent grid */}
      <div className="flex-1 overflow-y-auto px-6 py-6" style={{ position: 'relative', zIndex: 2 }}>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-outline text-sm animate-pulse">Loading agents…</span>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <span className="text-3xl">🤖</span>
            <span className="text-outline text-sm">No agents yet</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {agents.map(agent => (
              <AgentCard
                key={agent.agentId}
                agent={agent}
                onEdit={openEdit}
                onDelete={handleDelete}
                onDuplicate={openDuplicate}
                usageCount={usage[agent.agentId] ?? 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Slide-in editor */}
      <AgentEditor
        agent={editingAgent}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}
