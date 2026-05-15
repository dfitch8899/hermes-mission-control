'use client'

import { Bell, Search, ChevronDown, Cpu } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

// ── Model Picker ────────────────────────────────────────────────────────────

interface ModelOption { value: string; label: string; description: string }

function ModelPicker() {
  // Initial display before the API call returns. Kept in sync with the GET
  // /api/hermes/model fallback so a cold first paint shows the same value
  // we'd hand back if DDB hasn't been written yet.
  const [model,   setModel]   = useState<string>('gpt-5.5')
  const [options, setOptions] = useState<ModelOption[]>([])
  const [open,    setOpen]    = useState(false)
  const [saving,  setSaving]  = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/hermes/model')
      .then(r => r.json())
      .then(d => {
        if (d.model)   setModel(d.model)
        if (d.options) setOptions(d.options)
      })
      .catch(() => {})
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = async (value: string) => {
    if (value === model || saving) return
    setSaving(true)
    setOpen(false)
    try {
      await fetch('/api/hermes/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: value }),
      })
      setModel(value)
    } finally {
      setSaving(false)
    }
  }

  const label = options.find(o => o.value === model)?.label ?? model

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[10px] font-mono transition-all"
        style={{
          background: open ? 'rgba(60,215,255,0.08)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${open ? 'rgba(60,215,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
          color: saving ? '#859398' : '#3cd7ff',
        }}
      >
        <Cpu size={11} />
        <span>{saving ? 'switching…' : label}</span>
        <ChevronDown size={10} style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1.5 right-0 z-50 rounded-xl overflow-hidden py-1"
          style={{
            minWidth: 220,
            background: '#0d1323',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          }}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => void select(opt.value)}
              className="w-full flex flex-col px-3 py-2 text-left transition-colors"
              style={{
                background: opt.value === model ? 'rgba(60,215,255,0.08)' : 'transparent',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.background = opt.value === model ? 'rgba(60,215,255,0.08)' : 'transparent' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-medium" style={{ color: opt.value === model ? '#3cd7ff' : '#dde2f9' }}>
                  {opt.label}
                </span>
                {opt.value === model && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(60,215,255,0.15)', color: '#3cd7ff' }}>
                    active
                  </span>
                )}
              </div>
              <span className="text-[9px] font-mono" style={{ color: '#859398' }}>{opt.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TopAppBar ───────────────────────────────────────────────────────────────

interface TopAppBarProps {
  breadcrumb: string[]
}

export default function TopAppBar({ breadcrumb }: TopAppBarProps) {
  const [searchFocused, setSearchFocused] = useState(false)

  return (
    <header
      className="h-14 sticky top-0 z-40 flex items-center justify-between px-6 shrink-0 relative"
      style={{
        background: 'rgba(10, 15, 28, 0.65)',
        backdropFilter: 'blur(24px) saturate(200%)',
        WebkitBackdropFilter: 'blur(24px) saturate(200%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.25)',
      }}
    >
      {/* Bottom edge glow line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(60,215,255,0.08) 30%, rgba(93,246,224,0.1) 50%, rgba(60,215,255,0.08) 70%, transparent 100%)',
        }}
      />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-[10px] text-outline opacity-40">/</span>
            )}
            <span
              className={`text-[11px] uppercase tracking-[0.15em] font-headline font-bold ${
                i === breadcrumb.length - 1 ? '' : 'opacity-40'
              }`}
              style={{
                color: i === breadcrumb.length - 1 ? '#3cd7ff' : '#859398',
                textShadow: i === breadcrumb.length - 1 ? '0 0 12px rgba(60, 215, 255, 0.3)' : 'none',
              }}
            >
              {crumb}
            </span>
          </span>
        ))}
      </div>

      {/* Center: search */}
      <div className="flex-1 max-w-sm mx-8">
        <div
          className="flex items-center gap-2 px-3 h-8 rounded-lg"
          style={{
            background: searchFocused ? 'rgba(60, 215, 255, 0.04)' : 'rgba(255, 255, 255, 0.03)',
            border: searchFocused
              ? '1px solid rgba(60, 215, 255, 0.3)'
              : '1px solid rgba(255, 255, 255, 0.06)',
            boxShadow: searchFocused ? '0 0 20px rgba(60, 215, 255, 0.08)' : 'none',
            transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          <Search size={13} className="text-outline" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent border-none outline-none text-[12px] w-full placeholder:opacity-25 text-on-surface"
            style={{ fontFamily: 'var(--font-inter)' }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <kbd
            className="text-[9px] px-1.5 py-0.5 rounded hidden sm:block text-outline"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontFamily: 'var(--font-jetbrains-mono)',
            }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: model picker + status + bell + avatar */}
      <div className="flex items-center gap-3">
        {/* Model picker */}
        <ModelPicker />

        {/* Status chip */}
        <div
          className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-mono"
          style={{
            background: 'rgba(93, 246, 224, 0.06)',
            border: '1px solid rgba(93, 246, 224, 0.15)',
            color: '#5df6e0',
            boxShadow: '0 0 16px rgba(93, 246, 224, 0.06)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-live-pulse" style={{ backgroundColor: '#5df6e0' }} />
          All Systems Operational
        </div>

        {/* Bell */}
        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg text-outline"
          style={{ transition: 'background-color 0.15s ease, color 0.15s ease' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(60, 215, 255, 0.06)'
            e.currentTarget.style.color = '#3cd7ff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = '#859398'
          }}
        >
          <Bell size={16} />
        </button>

        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold font-headline shrink-0"
          style={{
            background: 'linear-gradient(135deg, #3cd7ff, #5df6e0)',
            color: '#001f27',
            boxShadow: '0 0 16px rgba(60, 215, 255, 0.35), 0 0 40px rgba(60, 215, 255, 0.1)',
          }}
        >
          H
        </div>
      </div>
    </header>
  )
}
