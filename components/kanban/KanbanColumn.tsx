'use client'

import { useState } from 'react'
import TaskCard from './TaskCard'
import type { KanbanTask, KanbanStatus } from '@/types/kanban'

interface Props {
  status:     KanbanStatus
  label:      string
  color:      string
  tasks:      KanbanTask[]
  onTaskClick:(task: KanbanTask) => void
  onDrop:     (taskId: string, newStatus: KanbanStatus) => void
}

export default function KanbanColumn({ status, label, color, tasks, onTaskClick, onDrop }: Props) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) onDrop(taskId, status)
  }

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        minWidth: 220,
        background: isDragOver ? `${color}08` : 'rgba(13,19,35,0.6)',
        border: isDragOver ? `1px solid ${color}44` : '1px solid rgba(255,255,255,0.07)',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: color, boxShadow: `0 0 6px ${color}88` }}
          />
          <span
            className="text-[11px] font-mono font-semibold uppercase tracking-widest"
            style={{ color }}
          >
            {label}
          </span>
        </div>
        <span
          className="text-[10px] font-mono px-1.5 py-0.5 rounded-md"
          style={{ background: `${color}15`, color }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-2 py-2" style={{ minHeight: 80 }}>
        {tasks.map(task => (
          <TaskCard
            key={task.taskId}
            task={task}
            onClick={() => onTaskClick(task)}
            onDragStart={e => {
              e.dataTransfer.setData('taskId', task.taskId)
              e.dataTransfer.effectAllowed = 'move'
            }}
          />
        ))}
        {tasks.length === 0 && (
          <div
            className="text-center text-[10px] font-mono py-4"
            style={{ color: 'rgba(133,147,152,0.35)' }}
          >
            drop here
          </div>
        )}
      </div>
    </div>
  )
}
