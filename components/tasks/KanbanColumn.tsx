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
            style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}80` }}
          />
          <h3 className="text-[11px] font-bold uppercase tracking-widest font-headline text-outline">
            {label}
          </h3>
        </div>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-md"
          style={{
            background: 'rgba(255,255,255,0.05)',
            color: '#859398',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto rounded-xl p-2 space-y-2 transition-all duration-200"
        style={{
          background: isOver
            ? `rgba(${accentColor === '#a8e8ff' ? '168,232,255' : '93,246,224'},0.04)`
            : 'rgba(13,19,35,0.4)',
          border: isOver
            ? `1px solid ${accentColor}40`
            : '1px solid rgba(255,255,255,0.06)',
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
          <div className="flex items-center justify-center py-8 text-[11px] font-mono text-outline">
            {isOver ? 'Drop here' : 'Empty'}
          </div>
        )}
      </div>
    </div>
  )
}
