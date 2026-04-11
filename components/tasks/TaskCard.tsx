'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatDistanceToNow } from 'date-fns'
import type { Task } from '@/types/task'
import Badge from '@/components/ui/Badge'

interface TaskCardProps {
  task: Task
  index?: number
  onClick?: () => void
}

const priorityBadge = {
  critical: 'red' as const,
  high: 'amber' as const,
  medium: 'cyan' as const,
  low: 'muted' as const,
}

const assigneeColor = {
  hermes: '#a8e8ff',
  human: '#5df6e0',
  both: '#b8c4ff',
}

const assigneeInitials = { hermes: 'H', human: 'U', both: 'B' }

import React from 'react'

function TaskCardInner({ task, index = 0, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.taskId })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  const acColor = assigneeColor[task.assignee]

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, animationDelay: `${index * 60}ms` }}
      className="animate-slide-in-left"
      {...attributes}
      {...listeners}
    >
      <div
        className="rounded-xl p-4 cursor-pointer select-none"
        style={{
          background: isDragging ? 'rgba(60,215,255,0.08)' : 'rgba(47,52,70,0.3)',
          border: isDragging ? '1px solid rgba(60,215,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
          borderLeft: `3px solid ${acColor}`,
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
        }}
        onClick={(e) => { e.stopPropagation(); onClick?.() }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.background = 'rgba(60,215,255,0.06)'
          el.style.borderColor = `${acColor}80`
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.background = 'rgba(47,52,70,0.3)'
          el.style.borderColor = 'rgba(255,255,255,0.08)'
          el.style.borderLeftColor = acColor
        }}
      >
        {/* Priority badge + assignee */}
        <div className="flex items-center justify-between mb-2">
          <Badge variant={priorityBadge[task.priority]}>{task.priority}</Badge>
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold font-mono shrink-0"
            style={{
              background: `${acColor}15`,
              color: acColor,
              border: `1px solid ${acColor}40`,
            }}
            title={task.assignee}
          >
            {assigneeInitials[task.assignee]}
          </div>
        </div>

        {/* Title */}
        <p className="text-[13px] font-medium leading-snug mb-1.5 text-on-surface">{task.title}</p>

        {/* Description */}
        {task.description && (
          <p className="text-[11px] leading-relaxed mb-2 line-clamp-2 text-outline">{task.description}</p>
        )}

        {/* Tags */}
        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {task.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-widest"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#859398', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] font-mono text-outline">{task.taskId}</span>
          <span className="text-[10px] font-mono text-outline">
            {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  )
}

const TaskCard = React.memo(TaskCardInner)
export default TaskCard
