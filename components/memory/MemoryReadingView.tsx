'use client'

import { X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Memory, MemoryType } from '@/types/memory'
import { formatDistanceToNow, format } from 'date-fns'

interface MemoryReadingViewProps {
  memory: Memory | null
  onClose: () => void
}

const typeBadge: Record<MemoryType, { label: string; color: string; bg: string }> = {
  context: { label: 'CONTEXT', color: '#388BFD', bg: 'rgba(56,139,253,0.1)' },
  skill: { label: 'SKILL', color: '#FFB300', bg: 'rgba(255,179,0,0.1)' },
  improvement: { label: 'IMPROVEMENT', color: '#14B8A6', bg: 'rgba(20,184,166,0.1)' },
}

export default function MemoryReadingView({ memory, onClose }: MemoryReadingViewProps) {
  if (!memory) return null

  const badge = typeBadge[memory.type]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded"
        style={{ backgroundColor: '#161B22', border: '0.5px solid #30363D' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '0.5px solid #30363D' }}
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-widest"
                style={{ color: badge.color, backgroundColor: badge.bg }}
              >
                {badge.label}
              </span>
              <span className="text-[10px] font-mono" style={{ color: '#484F58' }}>
                {memory.memoryId} · v{memory.version}
              </span>
            </div>
            <h2 className="text-lg font-headline font-bold" style={{ color: '#E6EDF3' }}>
              {memory.title}
            </h2>
            <div className="text-[10px] font-mono" style={{ color: '#484F58' }}>
              Created {format(new Date(memory.createdAt), 'PPP')} · Updated {formatDistanceToNow(new Date(memory.updatedAt), { addSuffix: true })}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded shrink-0 transition-colors duration-100"
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
        <div
          className="flex-1 overflow-y-auto px-8 py-6"
          style={{
            color: '#E6EDF3',
            fontFamily: 'var(--font-inter)',
            fontSize: '14px',
            lineHeight: '1.7',
          }}
        >
          <div className="prose-hermes">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-xl font-headline font-bold mb-4 mt-6 first:mt-0" style={{ color: '#FFB300' }}>
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-base font-headline font-semibold mb-3 mt-5" style={{ color: '#E6EDF3' }}>
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-headline font-semibold mb-2 mt-4" style={{ color: '#8B949E' }}>
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="mb-3 text-[13px]" style={{ color: '#E6EDF3' }}>
                    {children}
                  </p>
                ),
                code: ({ children, className }) => {
                  const isBlock = className?.includes('language-')
                  if (isBlock) {
                    return (
                      <pre
                        className="p-4 rounded my-3 overflow-x-auto text-[12px]"
                        style={{
                          backgroundColor: '#0D1117',
                          border: '0.5px solid #30363D',
                          fontFamily: 'var(--font-jetbrains-mono)',
                          color: '#E6EDF3',
                        }}
                      >
                        <code>{children}</code>
                      </pre>
                    )
                  }
                  return (
                    <code
                      className="px-1.5 py-0.5 rounded text-[12px]"
                      style={{
                        backgroundColor: '#0D1117',
                        color: '#FFB300',
                        fontFamily: 'var(--font-jetbrains-mono)',
                        border: '0.5px solid #21262D',
                      }}
                    >
                      {children}
                    </code>
                  )
                },
                ul: ({ children }) => (
                  <ul className="mb-3 space-y-1 pl-4" style={{ color: '#8B949E' }}>
                    {children}
                  </ul>
                ),
                li: ({ children }) => (
                  <li className="text-[13px] flex gap-2">
                    <span style={{ color: '#FFB300' }}>·</span>
                    <span>{children}</span>
                  </li>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto mb-3">
                    <table
                      className="w-full text-[12px]"
                      style={{ borderCollapse: 'collapse' }}
                    >
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th
                    className="px-3 py-2 text-left text-[10px] uppercase tracking-widest font-mono"
                    style={{ color: '#8B949E', borderBottom: '0.5px solid #30363D' }}
                  >
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td
                    className="px-3 py-2 text-[12px]"
                    style={{ color: '#E6EDF3', borderBottom: '0.5px solid #21262D' }}
                  >
                    {children}
                  </td>
                ),
                strong: ({ children }) => (
                  <strong style={{ color: '#E6EDF3', fontWeight: 600 }}>{children}</strong>
                ),
                blockquote: ({ children }) => (
                  <blockquote
                    className="pl-4 my-3 text-[13px]"
                    style={{
                      borderLeft: '2px solid #FFB300',
                      color: '#8B949E',
                    }}
                  >
                    {children}
                  </blockquote>
                ),
              }}
            >
              {memory.content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Tags footer */}
        {memory.tags.length > 0 && (
          <div
            className="flex items-center gap-2 px-6 py-3 shrink-0 flex-wrap"
            style={{ borderTop: '0.5px solid #30363D' }}
          >
            {memory.tags.map((tag) => (
              <span
                key={tag}
                className="text-[9px] font-mono px-2 py-0.5 rounded uppercase tracking-widest"
                style={{ backgroundColor: '#0D1117', color: '#484F58', border: '0.5px solid #21262D' }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
