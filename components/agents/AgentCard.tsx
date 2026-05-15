'use client'

import { Pencil, Trash2, Lock, Copy } from 'lucide-react'
import type { Agent } from '@/types/agent'

interface Props {
  agent:       Agent
  onEdit:      (agent: Agent) => void
  onDelete:    (agent: Agent) => void
  onDuplicate: (agent: Agent) => void
  /** Number of open kanban tasks currently assigned to this agent. Hidden when 0. */
  usageCount?: number
}

export default function AgentCard({ agent, onEdit, onDelete, onDuplicate, usageCount = 0 }: Props) {
  return (
    <div
      className="relative flex flex-col gap-3 rounded-xl p-5 transition-all duration-200 hover:scale-[1.01]"
      style={{
        background:  'rgba(255,255,255,0.03)',
        border:      `1px solid ${agent.color}33`,
        boxShadow:   `0 0 0 0 ${agent.color}00`,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 0 24px 0 ${agent.color}22`)}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = `0 0 0 0 ${agent.color}00`)}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="flex items-center justify-center text-2xl rounded-lg w-11 h-11 shrink-0"
          style={{ background: `${agent.color}1a`, border: `1px solid ${agent.color}33` }}
        >
          {agent.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white truncate">{agent.name}</span>
            {agent.isBuiltin && (
              <Lock size={11} style={{ color: agent.color }} className="shrink-0" />
            )}
          </div>
          <p className="text-[11px] text-outline truncate mt-0.5">{agent.description || 'No description'}</p>
        </div>
      </div>

      {/* Model pair */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded"
          style={{ background: `${agent.color}15`, color: agent.color, border: `1px solid ${agent.color}30` }}
        >
          ⚙ {agent.orchestratorModel}
        </span>
        <span className="text-outline text-[10px]">→</span>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded"
          style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          ⚡ {agent.workerModel}
        </span>
        <span
          className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded capitalize"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#64748b' }}
        >
          {agent.orchestratorPolicy}
        </span>
      </div>

      {/* Usage badge — only when > 0 */}
      {usageCount > 0 && (
        <div
          className="text-[10px] font-mono px-2 py-0.5 rounded self-start"
          style={{ background: 'rgba(60,215,255,0.06)', color: '#3cd7ff', border: '1px solid rgba(60,215,255,0.18)' }}
          title={`Open kanban tasks assigned to ${agent.name}`}
        >
          {usageCount} active task{usageCount === 1 ? '' : 's'}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => onEdit(agent)}
          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: agent.color, background: `${agent.color}12` }}
          onMouseEnter={(e) => (e.currentTarget.style.background = `${agent.color}22`)}
          onMouseLeave={(e) => (e.currentTarget.style.background = `${agent.color}12`)}
        >
          <Pencil size={11} />
          Edit
        </button>
        <button
          onClick={() => onDuplicate(agent)}
          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.04)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          title={`Create a new agent based on ${agent.name}`}
        >
          <Copy size={11} />
          Duplicate
        </button>
        {!agent.isBuiltin && (
          <button
            onClick={() => onDelete(agent)}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg transition-colors ml-auto"
            style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.16)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
          >
            <Trash2 size={11} />
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
