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
  medium: 'blue' as const,
  low: 'muted' as const,
}

const assigneeBorderColor = {
  hermes: '#FFB300',
  human: '#14B8A6',
  both: undefined,
}

const assigneeInitials = {
  hermes: 'H',
  human: 'U',
  both: 'B',
}

const assigneeBg = {
  hermes: '#2D1F00',
  human: '#001F1E',
  both: '#1C2128',
}

const assigneeFg = {
  hermes: '#FFB300',
  human: '#14B8A6',
  both: '#E6EDF3',
}

export default function TaskCard({ task, index = 0, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.taskId })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const borderColor = task.assignee === 'both'
    ? undefined
    : assigneeBorderColor[task.assignee]

  const isBoth = task.assignee === 'both'

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        animationDelay: `${index * 60}ms`,
      }}
      className="animate-slide-in-left"
      {...attributes}
      {...listeners}
    >
      <div
        className="rounded p-4 cursor-pointer select-none"
        style={{
          backgroundColor: '#1C2128',
          border: '0.5px solid #30363D',
          borderLeft: isBoth
            ? '3px solid #14B8A6'
            : `3px solid ${borderColor}`,
          background: isDragging ? '#21262D' : '#1C2128',
        }}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.()
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = isBoth ? '#14B8A6' : (borderColor || '#30363D')
          el.style.backgroundColor = '#21262D'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.backgroundColor = '#1C2128'
        }}
      >
        {/* Priority badge + assignee */}
        <div className="flex items-center justify-between mb-2">
          <Badge variant={priorityBadge[task.priority]}>{task.priority}</Badge>
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold font-mono shrink-0"
            style={{
              backgroundColor: assigneeBg[task.assignee],
              color: assigneeFg[task.assignee],
              border: `0.5px solid ${assigneeFg[task.assignee]}33`,
            }}
            title={task.assignee}
          >
            {assigneeInitials[task.assignee]}
          </div>
        </div>

        {/* Title */}
        <p className="text-[13px] font-medium leading-snug mb-1.5" style={{ color: '#E6EDF3' }}>
          {task.title}
        </p>

        {/* Description */}
        {task.description && (
          <p
            className="text-[11px] leading-relaxed mb-2 line-clamp-2"
            style={{ color: '#8B949E' }}
          >
            {task.description}
          </p>
        )}

        {/* Tags */}
        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {task.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-widest"
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
        <div className="flex items-center justify-between mt-1">
          <span
            className="text-[10px] font-mono"
            style={{ color: '#484F58' }}
          >
            {task.taskId}
          </span>
          <span
            className="text-[10px] font-mono"
            style={{ color: '#484F58' }}
          >
            {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    </div>
  )
}
