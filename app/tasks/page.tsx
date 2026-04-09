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
        style={{ borderBottom: '0.5px solid #30363D', backgroundColor: '#161B22' }}
      >
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color: '#8B949E' }}>
            {tasks.length} tasks
          </span>
          <span className="text-[11px] font-mono" style={{ color: '#484F58' }}>·</span>
          <span className="text-[11px] font-mono" style={{ color: '#FFB300' }}>
            {tasks.filter(t => t.status === 'in_progress').length} in progress
          </span>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-widest transition-all duration-100"
          style={{
            backgroundColor: 'rgba(255,179,0,0.1)',
            color: '#FFB300',
            border: '0.5px solid rgba(255,179,0,0.25)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255,179,0,0.15)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255,179,0,0.1)'
          }}
        >
          <Plus size={13} />
          New Task
        </button>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[12px] font-mono" style={{ color: '#484F58' }}>
            Loading tasks...
          </div>
        ) : (
          <KanbanBoard initialTasks={tasks} />
        )}
      </div>
    </div>
  )
}
