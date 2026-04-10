'use client'

import { useState, useEffect } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import KanbanBoard from '@/components/tasks/KanbanBoard'
import { MOCK_TASKS } from '@/lib/mockData'
import type { Task } from '@/types/task'
import { Plus } from 'lucide-react'

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.tasks?.length) setTasks(d.tasks)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopAppBar breadcrumb={['Hermes', 'Tasks']} />

      {/* Subheader */}
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(13,19,35,0.5)' }}
      >
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-mono uppercase tracking-widest text-outline">
            {tasks.length} tasks
          </span>
          <span className="text-outline text-[11px]">·</span>
          <span className="text-[11px] font-mono" style={{ color: '#3cd7ff' }}>
            {tasks.filter(t => t.status === 'in_progress').length} in progress
          </span>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-widest transition-all duration-100 active:scale-95"
          style={{
            background: 'rgba(60,215,255,0.08)',
            color: '#3cd7ff',
            border: '1px solid rgba(60,215,255,0.2)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(60,215,255,0.15)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(60,215,255,0.08)' }}
        >
          <Plus size={13} />
          New Task
        </button>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[12px] font-mono text-outline">
            Loading tasks...
          </div>
        ) : (
          <KanbanBoard initialTasks={tasks} />
        )}
      </div>
    </div>
  )
}
