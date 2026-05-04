'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Agent } from '@/types/agent'

interface Props {
  open:     boolean
  onPick:   (agent: Agent) => void
  onClose:  () => void
}

export default function AgentPickerModal({ open, onPick, onClose }: Props) {
  const [agents, setAgents] = useState<Agent[]>([])

  useEffect(() => {
    if (open) {
      fetch('/api/agents').then(r => r.json()).then(d => setAgents(d.agents ?? []))
    }
  }, [open])

  // Close on Escape → defaults to general (caller's onClose handles that)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: '#0d1323', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="font-semibold text-white">Choose Agent</span>
          <button onClick={onClose} className="text-outline hover:text-white transition-colors p-1 rounded"><X size={16} /></button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
          {agents.map(agent => (
            <button
              key={agent.agentId}
              onClick={() => onPick(agent)}
              className="flex items-center gap-3 p-4 rounded-xl text-left transition-all hover:scale-[1.02]"
              style={{ background: `${agent.color}0d`, border: `1px solid ${agent.color}30` }}
              onMouseEnter={(e) => (e.currentTarget.style.background = `${agent.color}1a`)}
              onMouseLeave={(e) => (e.currentTarget.style.background = `${agent.color}0d`)}
            >
              <span
                className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg shrink-0"
                style={{ background: `${agent.color}1a` }}
              >
                {agent.icon}
              </span>
              <div className="min-w-0">
                <div className="font-medium text-white text-sm truncate">{agent.name}</div>
                <div className="text-[11px] text-outline truncate mt-0.5">{agent.description}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="px-6 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[11px] text-outline text-center">Press <kbd className="px-1 rounded font-mono" style={{ background: 'rgba(255,255,255,0.07)' }}>Esc</kbd> to use General</p>
        </div>
      </div>
    </div>
  )
}
