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
        backgroundColor: 'rgba(13,17,23,0.85)',
        borderBottom: '0.5px solid #30363D',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-[10px]" style={{ color: '#484F58' }}>
                /
              </span>
            )}
            <span
              className={`text-[11px] uppercase tracking-widest font-headline font-bold ${
                i === breadcrumb.length - 1 ? '' : 'opacity-50'
              }`}
              style={{
                color: i === breadcrumb.length - 1 ? '#FFB300' : '#8B949E',
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
          className="flex items-center gap-2 px-3 h-8 rounded transition-all duration-150"
          style={{
            backgroundColor: '#1C2128',
            border: searchFocused ? '0.5px solid #FFB300' : '0.5px solid #30363D',
          }}
        >
          <Search size={13} style={{ color: '#484F58' }} />
          <input
            type="text"
            placeholder="Search..."
            className="bg-transparent border-none outline-none text-[12px] w-full placeholder:opacity-40"
            style={{
              color: '#E6EDF3',
              fontFamily: 'var(--font-inter)',
            }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <kbd
            className="text-[9px] px-1 py-0.5 rounded hidden sm:block"
            style={{
              backgroundColor: '#1C2128',
              border: '0.5px solid #30363D',
              color: '#484F58',
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
          className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest"
          style={{
            backgroundColor: 'rgba(63, 185, 80, 0.08)',
            border: '0.5px solid rgba(63, 185, 80, 0.2)',
            color: '#3FB950',
            fontFamily: 'var(--font-jetbrains-mono)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse-amber"
            style={{ backgroundColor: '#3FB950' }}
          />
          All Systems Operational
        </div>

        {/* Bell */}
        <button
          className="w-8 h-8 flex items-center justify-center rounded transition-colors duration-100"
          style={{ color: '#8B949E' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.color = '#E6EDF3'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = '#8B949E'
          }}
        >
          <Bell size={16} />
        </button>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold font-headline shrink-0"
          style={{
            backgroundColor: '#FFB300',
            color: '#0D1117',
            border: '1.5px solid rgba(255,179,0,0.4)',
          }}
        >
          H
        </div>
      </div>
    </header>
  )
}
