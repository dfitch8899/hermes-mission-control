'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import KanbanColumn from '@/components/kanban/KanbanColumn'
import TaskDrawer from '@/components/kanban/TaskDrawer'
import NewTaskModal from '@/components/kanban/NewTaskModal'
import { Plus, RefreshCw } from 'lucide-react'
import type { KanbanTask, KanbanStatus } from '@/types/kanban'
import { KANBAN_COLUMNS } from '@/types/kanban'

const POLL_INTERVAL_MS = 5000 // live-update every 5s

export default function KanbanPage() {
  const [tasks,          setTasks]          = useState<KanbanTask[]>([])
  const [loading,        setLoading]        = useState(true)
  const [selectedTask,   setSelectedTask]   = useState<KanbanTask | null>(null)
  const [showNewModal,   setShowNewModal]   = useState(false)
  const [lastUpdated,    setLastUpdated]    = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch all tasks ─────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try {
      const r = await fetch('/api/kanban')
      if (!r.ok) return
      const d = await r.json() as { tasks: KanbanTask[] }
      setTasks(d.tasks ?? [])
      setLastUpdated(new Date().toISOString())
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTasks()
    pollRef.current = setInterval(() => { void fetchTasks() }, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchTasks])

  // ── Drag and drop ───────────────────────────────────────────────────────────
  const handleDrop = useCallback(async (taskId: string, newStatus: KanbanStatus) => {
    const task = tasks.find(t => t.taskId === taskId)
    if (!task || task.status === newStatus) return

    // Optimistic update
    setTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, status: newStatus } : t))

    try {
      await fetch(`/api/kanban/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
    } catch {
      // Revert optimistic update on failure
      setTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, status: task.status } : t))
    }
  }, [tasks])

  // ── Task update (from drawer) ───────────────────────────────────────────────
  const handleUpdate = useCallback(async (taskId: string, patch: Record<string, unknown>) => {
    try {
      await fetch(`/api/kanban/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      // Close drawer and refresh
      setSelectedTask(null)
      setTimeout(() => void fetchTasks(), 2000) // give Hermes time to process
    } catch { /* silent */ }
  }, [fetchTasks])

  // ── Create task ─────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async (data: {
    title:          string
    description:    string
    assignee:       string
    priority:       string
    workspaceType:  string
    tenant:         string
  }) => {
    await fetch('/api/kanban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setTimeout(() => void fetchTasks(), 2500) // give Hermes time to process
  }, [fetchTasks])

  // ── Group by column ─────────────────────────────────────────────────────────
  const tasksByStatus = KANBAN_COLUMNS.reduce<Record<KanbanStatus, KanbanTask[]>>(
    (acc, col) => {
      acc[col.status] = tasks.filter(t => t.status === col.status && !t.archivedAt)
      return acc
    },
    {} as Record<KanbanStatus, KanbanTask[]>,
  )

  const formatTime = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: '#0d1323', position: 'relative' }}
    >
      {/* Background */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'url(/bg-overview.jpg)',
            backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.07,
          }}
        />
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(13,19,35,0.8) 0%, rgba(13,19,35,0.3) 50%, rgba(13,19,35,0.85) 100%)',
          }}
        />
      </div>

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        <TopAppBar breadcrumb={['Hermes', 'Kanban']} />
      </div>

      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{
          position: 'relative',
          zIndex: 10,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(13,19,35,0.7)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="flex items-center gap-4">
          <h1
            className="text-sm font-semibold tracking-wide uppercase"
            style={{ color: '#3cd7ff', letterSpacing: '0.12em' }}
          >
            Task Board
          </h1>
          <span className="text-[10px] font-mono" style={{ color: '#859398' }}>
            {tasks.filter(t => !t.archivedAt).length} active tasks
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: '#859398' }}>
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            {formatTime(lastUpdated)}
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all"
            style={{
              background: 'rgba(93,246,224,0.08)',
              border: '1px solid rgba(93,246,224,0.22)',
              color: '#5df6e0',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(93,246,224,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(93,246,224,0.08)' }}
          >
            <Plus size={13} /> New Task
          </button>
        </div>
      </div>

      {/* Board */}
      <div
        className="flex-1 overflow-x-auto overflow-y-hidden px-6 py-4"
        style={{ position: 'relative', zIndex: 5 }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[11px] font-mono animate-pulse" style={{ color: '#5df6e0' }}>
              Loading board...
            </div>
          </div>
        ) : (
          <div className="flex gap-4 h-full pb-2" style={{ minWidth: 'max-content' }}>
            {KANBAN_COLUMNS.map(col => (
              <div key={col.status} className="h-full" style={{ width: 240 }}>
                <KanbanColumn
                  status={col.status}
                  label={col.label}
                  color={col.color}
                  tasks={tasksByStatus[col.status] ?? []}
                  onTaskClick={setSelectedTask}
                  onDrop={handleDrop}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task drawer */}
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdate}
        />
      )}

      {/* New task modal */}
      {showNewModal && (
        <NewTaskModal
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}
