'use client'

import { useState, useEffect, useRef } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import KanbanBoard from '@/components/tasks/KanbanBoard'
import NewTaskModal from '@/components/tasks/NewTaskModal'
import { MOCK_TASKS } from '@/lib/mockData'
import type { Task } from '@/types/task'
import { Plus } from 'lucide-react'

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const addTaskToBoard = useRef<((task: Task) => void) | null>(null)

  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.tasks?.length) setTasks(d.tasks)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleTaskCreated = (task: Task) => {
    setTasks(prev => [task, ...prev])
    if (addTaskToBoard.current) addTaskToBoard.current(task)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'url(/bg-tasks.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top', opacity: 0.1, zIndex: 0 }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 20%, transparent 20%, #0d1323 75%)', zIndex: 1 }} />
      <TopAppBar breadcrumb={['Hermes', 'Tasks']} />

      {/* Subheader */}
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ position: 'relative', zIndex: 2, borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(13,19,35,0.5)' }}
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
          onClick={() => setModalOpen(true)}
        >
          <Plus size={13} />
          New Task
        </button>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-hidden" style={{ position: 'relative', zIndex: 2 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-[12px] font-mono text-outline">
            Loading tasks...
          </div>
        ) : (
          <KanbanBoard
            initialTasks={tasks}
            onRegisterAddTask={(fn) => { addTaskToBoard.current = fn }}
          />
        )}
      </div>

      <NewTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleTaskCreated}
      />
    </div>
  )
}
