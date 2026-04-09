'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Task, TaskStatus } from '@/types/task'
import TaskCard from './TaskCard'

interface KanbanColumnProps {
  status: TaskStatus
  label: string
  tasks: Task[]
  accentColor: string
  onTaskClick: (task: Task) => void
}

export default function KanbanColumn({ status, label, tasks, accentColor, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className="flex flex-col w-72 shrink-0 h-full">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <h3
            className="text-[11px] font-bold uppercase tracking-widest font-headline"
            style={{ color: '#8B949E' }}
          >
            {label}
          </h3>
        </div>
        <span
          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: '#161B22',
            color: '#484F58',
            border: '0.5px solid #30363D',
          }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto rounded p-2 space-y-2 transition-colors duration-150"
        style={{
          backgroundColor: isOver ? 'rgba(255,255,255,0.02)' : '#0D1117',
          border: isOver ? `0.5px solid ${accentColor}40` : '0.5px solid #21262D',
          minHeight: 120,
        }}
      >
        <SortableContext items={tasks.map((t) => t.taskId)} strategy={verticalListSortingStrategy}>
          {tasks.map((task, index) => (
            <TaskCard
              key={task.taskId}
              task={task}
              index={index}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div
            className="flex items-center justify-center py-8 text-[11px] font-mono"
            style={{ color: '#484F58' }}
          >
            {isOver ? 'Drop here' : 'Empty'}
          </div>
        )}
      </div>
    </div>
  )
}
