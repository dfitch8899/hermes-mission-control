'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopAppBar from '@/components/layout/TopAppBar'
import KanbanColumn from '@/components/kanban/KanbanColumn'
import TaskDrawer from '@/components/kanban/TaskDrawer'
import NewTaskModal from '@/components/kanban/NewTaskModal'
import NewBoardModal from '@/components/kanban/NewBoardModal'
import { Plus, RefreshCw, Search, ChevronDown, LayoutGrid, Trash2 } from 'lucide-react'
import type { KanbanTask, KanbanStatus, KanbanBoard } from '@/types/kanban'
import { KANBAN_COLUMNS } from '@/types/kanban'

const POLL_INTERVAL_MS = 5000

export default function KanbanPage() {
  const router = useRouter()

  // ── Board state ─────────────────────────────────────────────────────────
  const [boards,        setBoards]        = useState<KanbanBoard[]>([])
  const [activeBoard,   setActiveBoard]   = useState<string>('default')
  const [showBoardMenu, setShowBoardMenu] = useState(false)
  const [showNewBoard,  setShowNewBoard]  = useState(false)
  const [deletingBoard, setDeletingBoard] = useState<string | null>(null)

  // ── Task state ──────────────────────────────────────────────────────────
  const [tasks,          setTasks]          = useState<KanbanTask[]>([])
  const [loading,        setLoading]        = useState(true)
  const [selectedTask,   setSelectedTask]   = useState<KanbanTask | null>(null)
  const [showNewModal,   setShowNewModal]   = useState(false)
  const [lastUpdated,    setLastUpdated]    = useState<string | null>(null)
  const [searchQuery,    setSearchQuery]    = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Load boards once ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/kanban/boards')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.boards) setBoards(d.boards) })
      .catch(() => {})
  }, [])

  // ── Fetch tasks for active board ────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams({ board: activeBoard })
      if (searchQuery) params.set('search', searchQuery)
      const r = await fetch(`/api/kanban?${params}`)
      if (!r.ok) return
      const d = await r.json() as { tasks: KanbanTask[] }
      setTasks(d.tasks ?? [])
      setLastUpdated(new Date().toISOString())
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [activeBoard, searchQuery])

  useEffect(() => {
    setLoading(true)
    void fetchTasks()
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => { void fetchTasks() }, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchTasks])

  // ── Drag and drop ───────────────────────────────────────────────────────
  const handleDrop = useCallback(async (taskId: string, newStatus: KanbanStatus) => {
    const task = tasks.find(t => t.taskId === taskId)
    if (!task || task.status === newStatus) return
    setTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, status: newStatus } : t))
    try {
      const response = await fetch(`/api/kanban/${taskId}?board=${activeBoard}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!response.ok) throw new Error(`PATCH failed: ${response.status}`)
    } catch {
      setTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, status: task.status } : t))
    }
  }, [tasks, activeBoard])

  // ── Task update (from drawer) ───────────────────────────────────────────
  const handleUpdate = useCallback(async (taskId: string, patch: Record<string, unknown>) => {
    const response = await fetch(`/api/kanban/${taskId}?board=${activeBoard}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })

    if (!response.ok) {
      throw new Error(`PATCH failed: ${response.status}`)
    }

    const data = await response.json().catch(() => null) as { task?: KanbanTask } | null
    if (data?.task) {
      setTasks(prev => prev.map(task => task.taskId === taskId ? { ...task, ...data.task } : task))
      setSelectedTask(prev => prev?.taskId === taskId ? { ...prev, ...data.task } : prev)
    }

    setTimeout(() => void fetchTasks(), 800)
  }, [fetchTasks, activeBoard])

  // ── Launch task in chat (and mark as running) ───────────────────────────
  const handleLaunchInChat = useCallback(async (task: KanbanTask) => {
    const board = task.boardSlug ?? activeBoard

    // Optimistically move to "running"
    setTasks(prev => prev.map(t => t.taskId === task.taskId ? { ...t, status: 'running' } : t))
    setSelectedTask(null)

    // Persist the status change immediately
    await fetch(`/api/kanban/${task.taskId}?board=${board}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'running' }),
    }).catch(() => {})

    // Build a prompt that tells Hermes this is a kanban task and instructs
    // it to use its kanban tools.  The task ID is included so Hermes can
    // reference / update it directly with kanban_complete_task etc.
    const promptText = [
      `Please work on the following kanban task using your kanban tools.`,
      ``,
      `Task ID: ${task.taskId}`,
      `Title: ${task.title}`,
      task.body ? `Description:\n${task.body}` : null,
      ``,
      `When you have finished, call your \`kanban_complete_task\` tool (or run \`/kanban complete ${task.taskId}\`) to mark it done.`,
    ].filter(l => l !== null).join('\n')

    const params = new URLSearchParams({
      kanbanTask: task.taskId,
      board,
      agent:  task.assignee,
      prompt: promptText,
    })
    router.push(`/chat?${params.toString()}`)
  }, [router, activeBoard])

  // ── Create task ─────────────────────────────────────────────────────────
  const handleCreate = useCallback(async (data: {
    title: string; description: string; assignee: string
    priority: string; workspaceType: string; tenant: string; tags: string[]
  }) => {
    await fetch('/api/kanban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, board: activeBoard }),
    })
    // Task is written to DDB immediately, so a short delay is enough to see it
    setTimeout(() => void fetchTasks(), 500)
  }, [fetchTasks, activeBoard])

  // ── Create board ────────────────────────────────────────────────────────
  const handleCreateBoard = useCallback(async (name: string) => {
    const r = await fetch('/api/kanban/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (r.ok) {
      const d = await r.json() as { board: KanbanBoard }
      setBoards(prev =>
        [...prev, d.board].sort((a, b) =>
          a.slug === 'default' ? -1 : b.slug === 'default' ? 1 : a.name.localeCompare(b.name)
        )
      )
      setActiveBoard(d.board.slug)
    }
  }, [])

  // ── Delete board ────────────────────────────────────────────────────────
  const handleDeleteBoard = useCallback(async (slug: string) => {
    if (slug === 'default') return
    setDeletingBoard(slug)
    try {
      const r = await fetch(`/api/kanban/boards/${slug}`, { method: 'DELETE' })
      if (r.ok) {
        setBoards(prev => prev.filter(b => b.slug !== slug))
        if (activeBoard === slug) setActiveBoard('default')
      }
    } finally {
      setDeletingBoard(null)
    }
  }, [activeBoard])

  // ── Group by column ─────────────────────────────────────────────────────
  const tasksByStatus = KANBAN_COLUMNS.reduce<Record<KanbanStatus, KanbanTask[]>>(
    (acc, col) => {
      acc[col.status] = tasks.filter(t => t.status === col.status)
      return acc
    },
    {} as Record<KanbanStatus, KanbanTask[]>,
  )

  const activeBoardName = boards.find(b => b.slug === activeBoard)?.name ?? activeBoard

  const formatTime = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: '#0d1323', position: 'relative' }}
      onClick={() => setShowBoardMenu(false)}
    >
      {/* Background */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'url(/bg-overview.jpg)',
          backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.07,
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(13,19,35,0.8) 0%, rgba(13,19,35,0.3) 50%, rgba(13,19,35,0.85) 100%)',
        }} />
      </div>

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        <TopAppBar breadcrumb={['Hermes', 'Kanban', activeBoardName]} />
      </div>

      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0 gap-3"
        style={{
          position: 'relative', zIndex: 10,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(13,19,35,0.7)',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* Left: board selector + task count */}
        <div className="flex items-center gap-3">
          {/* Board picker */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowBoardMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#dde2f9',
              }}
            >
              <LayoutGrid size={11} style={{ color: '#3cd7ff' }} />
              {activeBoardName}
              <ChevronDown size={11} style={{ color: '#859398', transform: showBoardMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {showBoardMenu && (
              <div
                className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden"
                style={{
                  background: '#131b2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  minWidth: 200,
                  zIndex: 100,
                }}
              >
                {boards.map(b => (
                  <div
                    key={b.slug}
                    className="flex items-center group"
                    style={{
                      background: b.slug === activeBoard ? 'rgba(60,215,255,0.08)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (b.slug !== activeBoard) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (b.slug !== activeBoard) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <button
                      onClick={() => { setActiveBoard(b.slug); setShowBoardMenu(false) }}
                      className="flex-1 text-left px-4 py-2.5 text-[11px] font-mono transition-colors"
                      style={{ color: b.slug === activeBoard ? '#3cd7ff' : '#dde2f9' }}
                    >
                      {b.name}
                    </button>
                    {b.slug !== 'default' && (
                      <button
                        onClick={e => { e.stopPropagation(); void handleDeleteBoard(b.slug) }}
                        disabled={deletingBoard === b.slug}
                        className="opacity-0 group-hover:opacity-100 px-2 py-2.5 transition-opacity"
                        style={{ color: '#f43f5e' }}
                        title={`Delete board "${b.name}"`}
                      >
                        {deletingBoard === b.slug
                          ? <RefreshCw size={11} className="animate-spin" />
                          : <Trash2 size={11} />
                        }
                      </button>
                    )}
                  </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <button
                    onClick={() => { setShowNewBoard(true); setShowBoardMenu(false) }}
                    className="w-full text-left px-4 py-2.5 text-[11px] font-mono flex items-center gap-2 transition-colors"
                    style={{ color: '#5df6e0' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(93,246,224,0.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <Plus size={11} /> New Board
                  </button>
                </div>
              </div>
            )}
          </div>

          <span className="text-[10px] font-mono" style={{ color: '#859398' }}>
            {tasks.length} tasks
          </span>
        </div>

        {/* Center: search */}
        <div className="flex-1 max-w-xs relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#859398' }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-[11px] font-mono"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#dde2f9',
              outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(60,215,255,0.4)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)' }}
          />
        </div>

        {/* Right: refresh + new task */}
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
          onLaunchInChat={task => void handleLaunchInChat(task)}
        />
      )}

      {/* New task modal */}
      {showNewModal && (
        <NewTaskModal
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreate}
        />
      )}

      {/* New board modal */}
      {showNewBoard && (
        <NewBoardModal
          onClose={() => setShowNewBoard(false)}
          onCreate={handleCreateBoard}
        />
      )}
    </div>
  )
}
