'use client'

import { formatDistanceToNow } from 'date-fns'
import type { Memory, MemoryType } from '@/types/memory'

interface MemoryCardProps {
  memory: Memory
  onClick: () => void
  index?: number
}

const typeBadge: Record<MemoryType, { label: string; color: string; bg: string; border: string }> = {
  context: { label: 'CONTEXT', color: '#388BFD', bg: 'rgba(56,139,253,0.1)', border: 'rgba(56,139,253,0.25)' },
  skill: { label: 'SKILL', color: '#FFB300', bg: 'rgba(255,179,0,0.1)', border: 'rgba(255,179,0,0.25)' },
  improvement: { label: 'IMPROVEMENT', color: '#14B8A6', bg: 'rgba(20,184,166,0.1)', border: 'rgba(20,184,166,0.25)' },
}

export default function MemoryCard({ memory, onClick, index = 0 }: MemoryCardProps) {
  const badge = typeBadge[memory.type]

  return (
    <article
      className="rounded p-4 cursor-pointer flex flex-col gap-3 animate-slide-in-left transition-all duration-150"
      style={{
        animationDelay: `${index * 60}ms`,
        backgroundColor: '#1C2128',
        border: '0.5px solid #30363D',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        el.style.borderColor = badge.color + '50'
        el.style.backgroundColor = '#21262D'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        el.style.borderColor = '#30363D'
        el.style.backgroundColor = '#1C2128'
      }}
    >
      {/* Type badge + source */}
      <div className="flex items-center justify-between">
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-widest"
          style={{
            color: badge.color,
            backgroundColor: badge.bg,
            border: `0.5px solid ${badge.border}`,
          }}
        >
          {badge.label}
        </span>
        <span
          className="text-[9px] font-mono uppercase tracking-widest"
          style={{ color: memory.source === 'hermes' ? '#FFB300' : '#8B949E' }}
        >
          {memory.source}
        </span>
      </div>

      {/* Title */}
      <h4 className="text-[13px] font-semibold font-headline leading-snug" style={{ color: '#E6EDF3' }}>
        {memory.title}
      </h4>

      {/* Preview (strip markdown) */}
      <p
        className="text-[11px] leading-relaxed line-clamp-2"
        style={{ color: '#8B949E' }}
      >
        {memory.content.replace(/[#*`>\[\]]/g, '').trim()}
      </p>

      {/* Relevance bar */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: '#484F58' }}>
            Relevance
          </span>
          <span className="text-[9px] font-mono" style={{ color: '#FFB300' }}>
            {Math.round(memory.relevanceScore * 100)}%
          </span>
        </div>
        <div className="h-1 rounded-full" style={{ backgroundColor: '#21262D' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${memory.relevanceScore * 100}%`, backgroundColor: '#FFB300' }}
          />
        </div>
      </div>

      {/* Tags */}
      {memory.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {memory.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase"
              style={{
                backgroundColor: '#0D1117',
                color: '#484F58',
                border: '0.5px solid #21262D',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono" style={{ color: '#484F58' }}>
          v{memory.version} · {formatDistanceToNow(new Date(memory.updatedAt), { addSuffix: true })}
        </span>
        <span className="text-[9px] font-mono" style={{ color: '#484F58' }}>
          {memory.memoryId}
        </span>
      </div>
    </article>
  )
}
