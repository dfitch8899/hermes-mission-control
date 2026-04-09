'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CheckSquare, Brain, Calendar, Terminal } from 'lucide-react'

const navItems = [
  { path: '/', icon: Home, label: 'Overview' },
  { path: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { path: '/memory', icon: Brain, label: 'Memory' },
  { path: '/calendar', icon: Calendar, label: 'Calendar' },
  { path: '/terminal', icon: Terminal, label: 'Terminal' },
]

export default function SideNavBar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col z-50 sidebar-spring w-20 hover:w-64 group"
      style={{
        backgroundColor: '#161B22',
        borderRight: '0.5px solid #30363D',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-4 px-5 py-5 mb-2">
        <div
          className="w-9 h-9 rounded flex items-center justify-center shrink-0 font-headline font-black text-sm"
          style={{ backgroundColor: '#FFB300', color: '#0D1117' }}
        >
          H
        </div>
        <div className="overflow-hidden whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div
            className="font-headline font-black tracking-widest text-[13px] uppercase"
            style={{ color: '#FFB300' }}
          >
            HERMES v2.1
          </div>
          <div className="text-[9px] uppercase tracking-widest" style={{ color: '#484F58' }}>
            MISSION CONTROL
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.path
          const Icon = item.icon
          return (
            <Link
              key={item.path}
              href={item.path}
              className="flex items-center gap-4 px-3 py-3 rounded transition-colors duration-100 relative"
              style={{
                color: isActive ? '#FFB300' : '#8B949E',
                backgroundColor: isActive ? 'rgba(255,179,0,0.06)' : 'transparent',
                borderLeft: isActive ? '2px solid #FFB300' : '2px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = '#E6EDF3'
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = '#8B949E'
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              <Icon size={18} className="shrink-0" />
              <span
                className="text-[10px] uppercase tracking-widest whitespace-nowrap overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ fontFamily: 'var(--font-inter)' }}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom status */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-3">
          <div
            className="w-2 h-2 rounded-full shrink-0 animate-live-pulse"
            style={{ backgroundColor: '#3FB950' }}
          />
          <span
            className="text-[9px] uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            style={{ color: '#3FB950', fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            ONLINE
          </span>
        </div>
      </div>
    </aside>
  )
}
