'use client'

import { useState, useEffect, useRef } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import AgentCard from '@/components/agents/AgentCard'
import AgentEditor from '@/components/agents/AgentEditor'
import { Plus } from 'lucide-react'
import type { Agent } from '@/types/agent'

export default function AgentsPage() {
  const [agents,       setAgents]       = useState<Agent[]>([])
  const [loading,      setLoading]      = useState(true)
  const [editorOpen,   setEditorOpen]   = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null) // null = create new
  const seeded = useRef(false)

  // Seed built-in agents on first load, then fetch list
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    fetch('/api/agents/seed', { method: 'POST' })
      .catch(() => {})
      .finally(loadAgents)
  }, [])

  function loadAgents() {
    setLoading(true)
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => setAgents(d.agents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const openCreate = () => { setEditingAgent(null); setEditorOpen(true) }
  const openEdit   = (a: Agent) => { setEditingAgent(a); setEditorOpen(true) }

  const handleDelete = async (agent: Agent) => {
    if (!confirm(`Delete agent "${agent.name}"?`)) return
    const res = await fetch(`/api/agents/${agent.agentId}`, { method: 'DELETE' })
    if (res.ok) setAgents(prev => prev.filter(a => a.agentId !== agent.agentId))
    else {
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
