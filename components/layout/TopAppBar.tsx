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
      className="h-14 sticky top-0 z-40 flex items-center justify-between px-6 shrink-0"
      style={{
        background: 'rgba(13, 19, 35, 0.7)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-[10px] text-outline">/</span>
            )}
            <span
              className={`text-[11px] uppercase tracking-widest font-headline font-bold ${
                i === breadcrumb.length - 1 ? '' : 'opacity-50'
              }`}
              style={{
                color: i === breadcrumb.length - 1 ? '#a8e8ff' : '#859398',
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
          className="flex items-center gap-2 px-3 h-8 rounded-lg transition-all duration-200"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: searchFocused
              ? '1px solid rgba(60, 215, 255, 0.4)'
              : '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <Search size={13} className="text-outline" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent border-none outline-none text-[12px] w-full placeholder:opacity-30 text-on-surface"
            style={{ fontFamily: 'var(--font-inter)' }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <kbd
            className="text-[9px] px-1 py-0.5 rounded hidden sm:block text-outline"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
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
          className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-mono"
          style={{
            background: 'rgba(93, 246, 224, 0.08)',
            border: '1px solid rgba(93, 246, 224, 0.2)',
            color: '#5df6e0',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ backgroundColor: '#5df6e0' }} />
          All Systems Operational
        </div>

        {/* Bell */}
        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-100 text-outline hover:text-primary"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <Bell size={16} />
        </button>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold font-headline shrink-0"
          style={{
            background: 'linear-gradient(135deg, #3cd7ff, #5df6e0)',
            color: '#001f27',
            boxShadow: '0 0 12px rgba(60, 215, 255, 0.3)',
          }}
        >
          H
        </div>
      </div>
    </header>
  )
}
