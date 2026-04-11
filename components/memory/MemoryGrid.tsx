'use client'

import { useState, useMemo, useCallback } from 'react'
import type { Memory, MemoryType } from '@/types/memory'
import MemoryCard from './MemoryCard'
import MemorySearch from './MemorySearch'
import MemoryReadingView from './MemoryReadingView'

interface MemoryGridProps {
  initialMemories: Memory[]
}

type SortOption = 'relevance' | 'newest' | 'oldest' | 'title'

export default function MemoryGrid({ initialMemories }: MemoryGridProps) {
  const [memories, setMemories] = useState<Memory[]>(initialMemories)
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilters, setTypeFilters] = useState<MemoryType[]>([])
  const [sourceFilter, setSourceFilter] = useState<'all' | 'hermes' | 'user'>('all')
  const [sortBy, setSortBy] = useState<SortOption>('relevance')

  const typeCounts = useMemo(() => ({
    context: initialMemories.filter((m) => m.type === 'context').length,
    skill: initialMemories.filter((m) => m.type === 'skill').length,
    improvement: initialMemories.filter((m) => m.type === 'improvement').length,
  }), [initialMemories])

  // Collect all unique tags
  const allTags = useMemo(
    () => Array.from(new Set(initialMemories.flatMap((m) => m.tags))).slice(0, 20),
    [initialMemories]
  )

  const handleCardClick = useCallback((memory: Memory) => {
    setSelectedMemory(memory)
  }, [])

  const toggleType = (type: MemoryType) => {
    setTypeFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const filtered = useMemo(() => memories
    .filter((m) => {
      if (typeFilters.length > 0 && !typeFilters.includes(m.type)) return false
      if (sourceFilter !== 'all' && m.source !== sourceFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          m.title.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          m.tags.some((t) => t.toLowerCase().includes(q))
        )
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'relevance') return b.relevanceScore - a.relevanceScore
      if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return a.title.localeCompare(b.title)
    }), [memories, typeFilters, sourceFilter, searchQuery, sortBy])

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#859398',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    fontFamily: 'var(--font-jetbrains-mono)',
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left filter sidebar */}
      <aside
        className="w-60 shrink-0 flex flex-col overflow-y-auto p-4 space-y-5"
        style={{ borderRight: '1px solid rgba(255,255,255,0.07)', background: 'rgba(13,19,35,0.5)' }}
      >
        <div>
          <p style={labelStyle} className="mb-3">Type</p>
          {(['context', 'skill', 'improvement'] as MemoryType[]).map((type) => (
            <label key={type} className="flex items-center gap-2.5 py-1.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={typeFilters.includes(type)}
                onChange={() => toggleType(type)}
                className="sr-only"
              />
              <div
                className="w-4 h-4 rounded flex items-center justify-center transition-all duration-100"
                style={{
                  backgroundColor: typeFilters.includes(type) ? '#3cd7ff' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${typeFilters.includes(type) ? '#3cd7ff' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {typeFilters.includes(type) && (
                  <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                    <path d="M1 3L3 5L7 1" stroke="#0d1323" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-[12px] capitalize flex-1 text-on-surface">
                {type}
              </span>
              <span
                className="text-[10px] font-mono px-1 rounded"
                style={{
                  color: '#859398',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {typeCounts[type]}
              </span>
            </label>
          ))}
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '16px' }}>
          <p style={labelStyle} className="mb-3">Source</p>
          {(['all', 'hermes', 'user'] as const).map((s) => (
            <label key={s} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
              <input
                type="radio"
                checked={sourceFilter === s}
                onChange={() => setSourceFilter(s)}
                className="sr-only"
              />
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center transition-all duration-100"
                style={{
                  border: `1px solid ${sourceFilter === s ? '#3cd7ff' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {sourceFilter === s && (
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3cd7ff' }} />
                )}
              </div>
              <span className="text-[12px] capitalize text-on-surface">
                {s === 'all' ? 'All sources' : s}
              </span>
            </label>
          ))}
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '16px' }}>
          <p style={labelStyle} className="mb-3">Sort</p>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="w-full outline-none"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#dde2f9',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '12px',
              fontFamily: 'var(--font-inter)',
            }}
          >
            <option value="relevance">Relevance</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title A-Z</option>
          </select>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '16px' }}>
          <p style={labelStyle} className="mb-3">Tags</p>
          <div className="flex flex-wrap gap-1">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSearchQuery(tag)}
                className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-widest transition-colors duration-100"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  color: '#859398',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#a8e8ff'
                  e.currentTarget.style.borderColor = 'rgba(168,232,255,0.25)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#859398'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search bar */}
        <div className="px-6 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <MemorySearch onSearch={setSearchQuery} />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] font-mono text-outline">
              {filtered.length} memories
            </span>
          </div>
        </div>

        {/* Grid */}
        <div
          className="flex-1 overflow-y-auto p-6"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', alignContent: 'start' }}
        >
          {filtered.map((memory, i) => (
            <MemoryCard
              key={memory.memoryId}
              memory={memory}
              index={i}
              onClick={() => handleCardClick(memory)}
            />
          ))}

          {filtered.length === 0 && (
            <div
              className="col-span-full text-center py-16 text-[12px] font-mono text-outline"
            >
              No memories match your filters
            </div>
          )}
        </div>
      </div>

      {/* Reading view overlay */}
      {selectedMemory && (
        <MemoryReadingView
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
        />
      )}
    </div>
  )
}
