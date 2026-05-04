'use client'

import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import type { Agent } from '@/types/agent'
import { MODEL_OPTIONS, POLICY_OPTIONS } from '@/types/agent'

const ICON_OPTIONS = ['✨','💻','📢','🔬','🧑‍💻','🤖','🎨','📊','🔧','🌐','🚀','🎯','📝','🔍','⚡']
const COLOR_OPTIONS = ['#3cd7ff','#4ade80','#f97316','#a78bfa','#f43f5e','#facc15','#38bdf8','#fb7185']

interface Props {
  agent:    Agent | null   // null = creating new
  open:     boolean
  onClose:  () => void
  onSaved:  (agent: Agent) => void
}

export default function AgentEditor({ agent, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Partial<Agent>>({})
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    if (open) {
      setForm(agent ? { ...agent } : {
        name:               '',
        description:        '',
        icon:               '🤖',
        color:              '#3cd7ff',
        systemPrompt:       '',
        orchestratorModel:  'gpt-5.4',
        workerModel:        'gpt-5.4',
        orchestratorPolicy: 'auto',
      })
      setError('')
    }
  }, [open, agent])

  const set = (key: keyof Agent, val: unknown) => setForm(f => ({ ...f, [key]: val }))

  const handleSave = async () => {
    if (!form.name?.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      const isNew = !agent
      const url   = isNew ? '/api/agents' : `/api/agents/${agent!.agentId}`
      const method= isNew ? 'POST'         : 'PATCH'
      const res   = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data  = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onSaved(data.agent ?? { ...agent, ...form, updatedAt: new Date().toISOString() } as Agent)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div
        className="relative flex flex-col w-full max-w-md h-full overflow-y-auto"
        style={{ background: '#0d1323', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="font-semibold text-white">{agent ? 'Edit Agent' : 'New Agent'}</span>
          <button onClick={onClose} className="text-outline hover:text-white transition-colors p-1 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 flex flex-col gap-5">
          {/* Icon + Color row */}
          <div className="flex gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-mono uppercase tracking-widest text-outline">Icon</label>
              <div className="flex flex-wrap gap-1.5 max-w-[140px]">
                {ICON_OPTIONS.map(ic => (
                  <button
                    key={ic}
                    onClick={() => set('icon', ic)}
                    className="text-lg w-8 h-8 rounded flex items-center justify-center transition-all"
                    style={{ background: form.icon === ic ? `${form.color ?? '#3cd7ff'}30` : 'rgba(255,255,255,0.05)', border: form.icon === ic ? `1px solid ${form.color ?? '#3cd7ff'}` : '1px solid transparent' }}
                  >{ic}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-mono uppercase tracking-widest text-outline">Color</label>
              <div className="flex flex-wrap gap-1.5 max-w-[100px]">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => set('color', c)}
                    className="w-7 h-7 rounded-full transition-all"
                    style={{ background: c, outline: form.color === c ? `2px solid white` : 'none', outlineOffset: '2px' }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono uppercase tracking-widest text-outline">Name</label>
            <input
              value={form.name ?? ''}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Coding"
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-outline outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono uppercase tracking-widest text-outline">Description</label>
            <input
              value={form.description ?? ''}
              onChange={e => set('description', e.target.value)}
              placeholder="One-line summary"
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-outline outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* System Prompt */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono uppercase tracking-widest text-outline">System Prompt</label>
            <textarea
              value={form.systemPrompt ?? ''}
              onChange={e => set('systemPrompt', e.target.value)}
              placeholder="Agent persona and instructions…"
              rows={5}
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-outline outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Model pair */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-mono uppercase tracking-widest text-outline">Orchestrator Model</label>
              <select
                value={form.orchestratorModel ?? 'gpt-5.4'}
                onChange={e => set('orchestratorModel', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-mono uppercase tracking-widest text-outline">Worker Model</label>
              <select
                value={form.workerModel ?? 'gpt-5.4'}
                onChange={e => set('workerModel', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {MODEL_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {/* Policy */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono uppercase tracking-widest text-outline">Orchestration Policy</label>
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
              {POLICY_OPTIONS.map((p, i) => (
                <button
                  key={p.value}
                  onClick={() => set('orchestratorPolicy', p.value)}
                  className="flex-1 px-3 py-2 text-[12px] font-medium transition-colors"
                  style={{
                    background: form.orchestratorPolicy === p.value ? `${form.color ?? '#3cd7ff'}25` : 'rgba(255,255,255,0.03)',
                    color:      form.orchestratorPolicy === p.value ? form.color ?? '#3cd7ff' : '#64748b',
                    borderRight: i < POLICY_OPTIONS.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  }}
                  title={p.description}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-opacity disabled:opacity-50"
            style={{ background: form.color ?? '#3cd7ff', color: '#0d1323' }}
          >
            <Save size={14} />
            {saving ? 'Saving…' : 'Save Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
