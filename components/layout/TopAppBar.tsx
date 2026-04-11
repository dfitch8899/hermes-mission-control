'use client'

import { Bell, Search } from 'lucide-react'
import { useState } from 'react'

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

      {/* Right: status + bell + avatar */}
      <div className="flex items-center gap-4">
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
