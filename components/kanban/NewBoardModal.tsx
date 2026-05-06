'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  onClose:  () => void
  onCreate: (name: string) => Promise<void>
}

export default function NewBoardModal({ onClose, onCreate }: Props) {
  const [name,    setName]    = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    if (!name.trim() || loading) return
    setLoading(true)
    try {
      await onCreate(name.trim())
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: '#0d1323',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <span className="font-semibold text-white text-sm">New Board</span>
          <button onClick={onClose} style={{ color: '#859398' }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          <div>
            <label
              className="block mb-1.5"
              style={{ fontSize: 10, fontFamily: 'monospace', color: '#859398', textTransform: 'uppercase', letterSpacing: '0.1em' }}
            >
              Board Name *
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void submit() }}
              placeholder="e.g. Marketing Sprint"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                color: '#dde2f9',
                fontSize: 13,
                padding: '10px 14px',
                width: '100%',
                outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(60,215,255,0.4)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex gap-3 px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#859398',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!name.trim() || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: name.trim() && !loading ? 'linear-gradient(135deg, #3cd7ff, #5df6e0)' : 'rgba(60,215,255,0.1)',
              color: name.trim() && !loading ? '#001f27' : 'rgba(60,215,255,0.4)',
              cursor: name.trim() && !loading ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? 'Creating...' : 'Create Board'}
          </button>
        </div>
      </div>
    </div>
  )
}
