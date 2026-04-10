'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CheckSquare, Brain, Calendar, Terminal, Zap } from 'lucide-react'

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
      className="fixed left-0 top-0 h-full flex flex-col z-50 sidebar-spring w-20 hover:w-64 group overflow-hidden"
      style={{
        background: 'rgba(13, 19, 35, 0.6)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-4 px-5 py-6 mb-2">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-headline font-black text-sm"
          style={{
            background: 'linear-gradient(135deg, #3cd7ff, #5df6e0)',
            color: '#001f27',
            boxShadow: '0 0 20px rgba(60, 215, 255, 0.3)',
          }}
        >
          H
        </div>
        <div className="overflow-hidden whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="font-headline font-bold tracking-widest text-[13px] uppercase text-primary">
            HERMES
          </div>
          <div className="text-[9px] uppercase tracking-widest text-outline">
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
              className="flex items-center gap-4 px-3 py-3 rounded-xl transition-all duration-200 relative"
              style={{
                color: isActive ? '#a8e8ff' : '#859398',
                background: isActive ? 'rgba(168, 232, 255, 0.08)' : 'transparent',
                borderRight: isActive ? '3px solid #3cd7ff' : '3px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = '#dde2f9'
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = '#859398'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <Icon size={18} className="shrink-0" />
              <span
                className="text-[10px] uppercase tracking-widest whitespace-nowrap overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-label font-medium"
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Deploy button */}
      <div className="px-3 pb-4">
        <button
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-200 active:scale-95"
          style={{
            background: 'rgba(60, 215, 255, 0.1)',
            border: '1px solid rgba(60, 215, 255, 0.2)',
            color: '#3cd7ff',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(60, 215, 255, 0.18)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(60, 215, 255, 0.1)'
          }}
        >
          <Zap size={16} className="shrink-0" />
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[10px] font-label font-bold uppercase tracking-widest whitespace-nowrap overflow-hidden">
            Deploy Agent
          </span>
        </button>
      </div>

      {/* Bottom status */}
      <div className="px-5 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-2 h-2 rounded-full shrink-0 animate-live-pulse"
            style={{ backgroundColor: '#5df6e0' }}
          />
          <span
            className="text-[9px] uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-mono"
            style={{ color: '#5df6e0' }}
          >
            ONLINE
          </span>
        </div>
      </div>
    </aside>
  )
}
