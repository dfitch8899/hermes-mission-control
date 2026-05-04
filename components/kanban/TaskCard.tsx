'use client'

import { MessageSquare, Link2, ChevronRight } from 'lucide-react'
import type { KanbanTask } from '@/types/kanban'

const AGENT_COLORS: Record<string, string> = {
  general:   '#3cd7ff',
  coding:    '#4ade80',
  marketing: '#f97316',
  research:  '#a78bfa',
}
const AGENT_ICONS: Record<string, string> = {
  general:   '✨',
  coding:    '💻',
  marketing: '📢',
  research:  '🔬',
}
const PRIORITY_COLORS = { low: '#859398', normal: '#3cd7ff', high: '#f97316' }

interface Props {
  task:        KanbanTask
  onClick:     () => void
  onDragStart: (e: React.DragEvent) => void
}

export default function TaskCard({ task, onClick, onDragStart }: Props) {
  const agentColor  = AGENT_COLORS[task.assignee]  ?? '#3cd7ff'
  const agentIcon   = AGENT_ICONS[task.assignee]   ?? '✨'
  const priColor    = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.normal
  const totalChildren   = task.childIds.length
  // We don't have completed-child count here; show dep count instead
  const depCount    = task.parentIds.length + task.childIds.length

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter') onClick() }}
      className="rounded-xl px-3 py-2.5 mb-2 cursor-grab active:cursor-grabbing select-none transition-all duration-100 group"
      style={{
        background: 'rgba(20, 27, 48, 0.85)',
        border: `1px solid ${agentColor}22`,
        boxShadow: `0 2px 8px rgba(0,0,0,0.3)`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.border = `1px solid ${agentColor}55`
        e.currentTarget.style.boxShadow = `0 4px 16px rgba(0,0,0,0.4), 0 0 12px ${agentColor}11`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.border = `1px solid ${agentColor}22`
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
      }}
    >
      {/* Header row: agent badge + priority */}
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-md"
          style={{ background: `${agentColor}15`, color: agentColor }}
        >
          {agentIcon} {task.assignee}
        </span>
        <span
          className="text-[9px] font-mono uppercase tracking-wider"
          style={{ color: priColor }}
        >
          {task.priority}
        </span>
      </div>

      {/* Title */}
      <div
        className="text-[12px] font-medium leading-snug mb-1.5 line-clamp-2"
        style={{ color: '#dde2f9' }}
      >
        {task.title}
      </div>

      {/* Body preview */}
      {task.body && (
        <div
          className="text-[10px] leading-relaxed mb-2 line-clamp-2"
          style={{ color: '#859398' }}
        >
          {task.body}
        </div>
      )}

      {/* Footer: comments + deps */}
      <div className="flex items-center gap-3 mt-1">
        {task.commentCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: '#859398' }}>
            <MessageSquare size={10} /> {task.commentCount}
          </span>
        )}
        {depCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: '#859398' }}>
            <Link2 size={10} /> {depCount}
          </span>
        )}
        <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronRight size={12} style={{ color: '#859398' }} />
        </span>
      </div>
    </div>
  )
}
