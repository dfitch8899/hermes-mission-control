'use client'

import { formatDistanceToNow } from 'date-fns'
import type { Memory, MemoryType } from '@/types/memory'

interface MemoryCardProps {
  memory: Memory
  onClick: () => void
  index?: number
}

const typeBadge: Record<MemoryType, { label: string; color: string; bg: string; border: string }> = {
  context: { label: 'CONTEXT', color: '#b8c4ff', bg: 'rgba(184,196,255,0.1)', border: 'rgba(184,196,255,0.25)' },
  skill: { label: 'SKILL', color: '#a8e8ff', bg: 'rgba(168,232,255,0.1)', border: 'rgba(168,232,255,0.25)' },
  improvement: { label: 'IMPROVEMENT', color: '#5df6e0', bg: 'rgba(93,246,224,0.1)', border: 'rgba(93,246,224,0.25)' },
}

export default function MemoryCard({ memory, onClick, index = 0 }: MemoryCardProps) {
  const badge = typeBadge[memory.type]

  return (
    <article
      className="rounded-xl p-4 cursor-pointer flex flex-col gap-3 animate-slide-in-left transition-all duration-150"
      style={{
        animationDelay: `${index * 60}ms`,
        backgroundColor: 'rgba(47,52,70,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        el.style.borderColor = badge.color + '50'
        el.style.backgroundColor = 'rgba(255,255,255,0.05)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        el.style.borderColor = 'rgba(255,255,255,0.08)'
        el.style.backgroundColor = 'rgba(47,52,70,0.3)'
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
          style={{ color: memory.source === 'hermes' ? '#a8e8ff' : '#859398' }}
        >
          {memory.source}
        </span>
      </div>

      {/* Title */}
      <h4 className="text-[13px] font-semibold font-headline leading-snug" style={{ color: '#dde2f9' }}>
        {memory.title}
      </h4>

      {/* Preview (strip markdown) */}
      <p
        className="text-[11px] leading-relaxed line-clamp-2"
        style={{ color: '#859398' }}
      >
        {memory.content.replace(/[#*`>\[\]]/g, '').trim()}
      </p>

      {/* Relevance bar */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: '#859398' }}>
            Relevance
          </span>
          <span className="text-[9px] font-mono" style={{ color: '#3cd7ff' }}>
            {Math.round(memory.relevanceScore * 100)}%
          </span>
        </div>
        <div className="h-1 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${memory.relevanceScore * 100}%`, backgroundColor: '#3cd7ff' }}
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
                backgroundColor: 'rgba(255,255,255,0.04)',
                color: '#859398',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono" style={{ color: '#859398' }}>
          v{memory.version} · {formatDistanceToNow(new Date(memory.updatedAt), { addSuffix: true })}
        </span>
        <span className="text-[9px] font-mono" style={{ color: '#859398' }}>
          {memory.memoryId}
        </span>
      </div>
    </article>
  )
}
