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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
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
          backgroundColor: '#161B22',
          borderLeft: '0.5px solid #30363D',
          transform: open ? 'translateX(0)' : `translateX(${width}px)`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 h-14 shrink-0"
          style={{ borderBottom: '0.5px solid #30363D' }}
        >
          <span className="text-[11px] uppercase tracking-widest font-headline font-bold" style={{ color: '#FFB300' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded transition-colors duration-100"
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
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  )
}
