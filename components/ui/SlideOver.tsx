'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface SlideOverProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: number
}

export default function SlideOver({ open, onClose, title, children, width = 480 }: SlideOverProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 transition-opacity duration-300"
        style={{
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col transition-transform duration-300 ease-out"
        style={{
          width: `${width}px`,
          background: 'rgba(13,19,35,0.92)',
          backdropFilter: 'blur(24px) saturate(180%)',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
          transform: open ? 'translateX(0)' : `translateX(${width}px)`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-14 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-[11px] uppercase tracking-widest font-headline font-bold" style={{ color: '#a8e8ff' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-100 text-outline hover:text-on-surface"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <X size={16} />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  )
}
