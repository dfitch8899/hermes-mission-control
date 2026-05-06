'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Brain, Calendar, Terminal, MessageSquare, Bot, Kanban } from 'lucide-react'

const navItems = [
  { path: '/', icon: Home, label: 'Overview' },
  { path: '/chat', icon: MessageSquare, label: 'Chat' },
  { path: '/agents', icon: Bot, label: 'Agents' },
  { path: '/kanban', icon: Kanban, label: 'Kanban' },
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
        background: 'rgba(10, 15, 28, 0.75)',
        backdropFilter: 'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: '4px 0 32px rgba(0,0,0,0.4), inset -1px 0 0 rgba(60, 215, 255, 0.04)',
      }}
    >
      {/* Animated right-edge glow line */}
      <div
        className="absolute right-0 top-0 bottom-0 w-px pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(60,215,255,0.15) 30%, rgba(93,246,224,0.2) 50%, rgba(60,215,255,0.15) 70%, transparent 100%)',
        }}
      />

      {/* Logo */}
      <div className="flex items-center gap-4 px-5 py-6 mb-2">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-headline font-black text-sm relative"
          style={{
            background: 'linear-gradient(135deg, #3cd7ff, #5df6e0)',
            color: '#001f27',
            boxShadow: '0 0 24px rgba(60, 215, 255, 0.35), 0 0 60px rgba(60, 215, 255, 0.1)',
          }}
        >
          H
          {/* Pulsing ring around logo */}
          <div
            className="absolute inset-[-3px] rounded-xl animate-breathe-glow"
            style={{
              border: '1px solid rgba(60, 215, 255, 0.15)',
            }}
          />
        </div>
        <div className="overflow-hidden whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="font-headline font-bold tracking-widest text-[13px] uppercase text-glow-cyan" style={{ color: '#3cd7ff' }}>
            HERMES
          </div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-outline">
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
              className="flex items-center gap-4 px-3 py-3 rounded-xl relative overflow-hidden"
              style={{
                color: isActive ? '#3cd7ff' : '#859398',
                background: isActive ? 'rgba(60, 215, 255, 0.08)' : 'transparent',
                borderRight: isActive ? '2px solid #3cd7ff' : '2px solid transparent',
                boxShadow: isActive ? 'inset 0 0 20px rgba(60, 215, 255, 0.05)' : 'none',
                transition: 'color 0.2s ease, background-color 0.2s ease',
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
              {/* Active item glow backdrop */}
              {isActive && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'radial-gradient(ellipse at 0% 50%, rgba(60,215,255,0.08), transparent 70%)',
                  }}
                />
              )}
              <Icon size={18} className="shrink-0 relative z-10" style={isActive ? { filter: 'drop-shadow(0 0 6px rgba(60,215,255,0.5))' } : {}} />
              <span
                className="text-[10px] uppercase tracking-widest whitespace-nowrap overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-label font-medium relative z-10"
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom status */}
      <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                backgroundColor: '#5df6e0',
                boxShadow: '0 0 12px rgba(93, 246, 224, 0.6)',
              }}
            />
            <div
              className="absolute inset-[-2px] rounded-full animate-live-pulse"
              style={{ border: '1px solid rgba(93, 246, 224, 0.3)' }}
            />
          </div>
          <span
            className="text-[9px] uppercase tracking-[0.2em] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-mono font-medium"
            style={{ color: '#5df6e0' }}
          >
            ONLINE
          </span>
        </div>
      </div>
    </aside>
  )
}
