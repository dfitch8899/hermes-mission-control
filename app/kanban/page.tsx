"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopAppBar from '@/components/layout/TopAppBar'
import KanbanColumn from '@/components/kanban/KanbanColumn'
import TaskDrawer from '@/components/kanban/TaskDrawer'
import NewTaskModal from '@/components/kanban/NewTaskModal'
import NewBoardModal from '@/components/kanban/NewBoardModal'
import { Plus, RefreshCw, Search, ChevronDown, LayoutGrid, Trash2 } from 'lucide-react'
import type { KanbanBackend, KanbanTask, KanbanStatus, KanbanBoard } from '@/types/kanban'
import { KANBAN_COLUMNS } from '@/types/kanban'

const POLL_INTERVAL_MS = 5000
const BOARD_STORAGE_KEY = 'mission-control-kanban-board'

export default function KanbanPage() {
  const router = useRouter()
  const [boards, setBoards] = useState<KanbanBoard[]>([])
  const [activeBoard, setActiveBoard] = useState<string>('default')
  const [showBoardMenu, setShowBoardMenu] = useState(false)
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [deletingBoard, setDeletingBoard] = useState<string | null>(null)

  const [tasks, setTasks] = useState<KanbanTask[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [tenantFilter, setTenantFilter] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [boardBackend, setBoardBackend] = useState<KanbanBackend>('legacy')
  const [boardReady, setBoardReady] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(BOARD_STORAGE_KEY)
    if (stored) setActiveBoard(stored)
    setBoardReady(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !boardReady) return
    window.localStorage.setItem(BOARD_STORAGE_KEY, activeBoard)
  }, [activeBoard, boardReady])

  const fetchBoards = useCallback(async () => {
    const response = await fetch('/api/kanban/boards?include_archived=true')
    if (!response.ok) return
    const data = await response.json() as { boards?: KanbanBoard[] }
    if (data.boards) setBoards(data.boards)
  }, [])

  useEffect(() => {
    if (!boardReady) return
    void fetchBoards()
  }, [fetchBoards, boardReady])

  useEffect(() => {
    if (!boardReady || boards.length === 0) return
    if (!boards.some(board => board.slug === activeBoard)) setActiveBoard('default')
  }, [activeBoard, boards, boardReady])

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams({ board: activeBoard })
      if (searchQuery) params.set('search', searchQuery)
      if (assigneeFilter) params.set('assignee', assigneeFilter)
      if (tenantFilter) params.set('tenant', tenantFilter)
      if (includeArchived) params.set('include_archived', 'true')
      const response = await fetch(`/api/kanban?${params.toString()}`)
      if (!response.ok) return
      const data = await response.json() as { tasks: KanbanTask[]; backend?: KanbanBackend }
      setTasks(data.tasks ?? [])
      setBoardBackend(data.backend === 'native' ? 'native' : 'legacy')
      setLastUpdated(new Date().toISOString())
    } catch {
      // ignore transient failures
    } finally {
      setLoading(false)
    }
  }, [activeBoard, assigneeFilter, includeArchived, searchQuery, tenantFilter])

  useEffect(() => {
    if (!boardReady) return
    setLoading(true)
    void fetchTasks()
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => { void fetchTasks() }, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchTasks, boardReady])

  const replaceTask = useCallback((taskId: string, patch: Partial<KanbanTask>) => {
    setTasks(prev => prev.map(task => task.taskId === taskId ? { ...task, ...patch } : task))
    setSelectedTask(prev => prev?.taskId === taskId ? { ...prev, ...patch } : prev)
  }, [])

  const handleDrop = useCallback(async (taskId: string, newStatus: KanbanStatus) => {
    const task = tasks.find(t => t.taskId === taskId)
    if (!task || task.status === newStatus) return
    if (boardBackend === 'native' && newStatus === 'running') return

    replaceTask(taskId, { status: newStatus })
    try {
      const response = await fetch(`/api/kanban/${taskId}?board=${activeBoard}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!response.ok) throw new Error(`PATCH failed: ${response.status}`)
      const data = await response.json().catch(() => null) as { task?: KanbanTask } | null
      if (data?.task) replaceTask(taskId, data.task)
      await fetchTasks()
    } catch {
      replaceTask(taskId, { status: task.status })
    }
  }, [tasks, boardBackend, replaceTask, activeBoard, fetchTasks])

  const handleUpdate = useCallback(async (taskId: string, patch: Record<string, unknown>) => {
    const response = await fetch(`/api/kanban/${taskId}?board=${activeBoard}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!response.ok) throw new Error(`PATCH failed: ${response.status}`)

    const data = await response.json().catch(() => null) as { task?: KanbanTask } | null
    if (data?.task) replaceTask(taskId, data.task)
    setTimeout(() => void fetchTasks(), 600)
    return data?.task
  }, [activeBoard, fetchTasks, replaceTask])

  const handleLaunchInChat = useCallback(async (task: KanbanTask) => {
    const board = task.boardSlug ?? activeBoard
    const response = await fetch(`/api/kanban/${task.taskId}/launch?board=${encodeURIComponent(board)}`, { method: 'POST' })
    const data = await response.json().catch(() => null) as {
      error?: string
      launchMode?: 'manual-chat' | 'dispatch'
      board?: string
      prompt?: string
      agentId?: string
      task?: KanbanTask
    } | null

    if (!response.ok) {
      throw new Error(data?.error || `launch failed: ${response.status}`)
    }

    if (data?.task) replaceTask(task.taskId, data.task)
    setTimeout(() => void fetchTasks(), 600)

    if (data?.launchMode === 'dispatch') return

    const promptText = data?.prompt?.trim()
    if (!promptText) throw new Error('launch prompt missing')

    const params = new URLSearchParams({
      kanbanTask: task.taskId,
      board: data?.board ?? board,
      agent: data?.agentId || task.assignee || 'general',
      prompt: promptText,
    })
    router.push(`/chat?${params.toString()}`)
  }, [router, activeBoard, fetchTasks, replaceTask])

  const handleCreate = useCallback(async (data: {
    title: string
    description: string
    assignee: string
    priority: string
    workspaceType: string
    workspacePath: string
    tenant: string
    tags: string[]
    parentIds: string[]
    triage: boolean
    idempotencyKey: string
    maxRuntimeSeconds?: number
    skills: string[]
  }) => {
    const response = await fetch('/api/kanban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, board: activeBoard }),
    })
    if (!response.ok) throw new Error(`POST failed: ${response.status}`)
    await fetchTasks()
  }, [activeBoard, fetchTasks])

  const handleCreateBoard = useCallback(async (data: { name: string; slug: string; description: string; icon: string; color: string; switchToBoard: boolean }) => {
    const response = await fetch('/api/kanban/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) throw new Error(`board create failed: ${response.status}`)
    const result = await response.json() as { board: KanbanBoard }
    await fetchBoards()
    if (data.switchToBoard && result.board?.slug) setActiveBoard(result.board.slug)
  }, [fetchBoards])

  const handleDeleteBoard = useCallback(async (slug: string) => {
    if (slug === 'default') return
    setDeletingBoard(slug)
    try {
      const response = await fetch(`/api/kanban/boards/${slug}`, { method: 'DELETE' })
      if (response.ok) {
        await fetchBoards()
        if (activeBoard === slug) setActiveBoard('default')
      }
    } finally {
      setDeletingBoard(null)
    }
  }, [activeBoard, fetchBoards])

  const tasksByStatus = useMemo(() => KANBAN_COLUMNS.reduce<Record<KanbanStatus, KanbanTask[]>>((acc, col) => {
    acc[col.status] = tasks.filter(task => task.status === col.status)
    return acc
  }, {} as Record<KanbanStatus, KanbanTask[]>), [tasks])

  const assignees = useMemo(() => Array.from(new Set([...tasks.map(task => task.assignee).filter(Boolean), assigneeFilter].filter(Boolean))).sort(), [tasks, assigneeFilter])
  const tenants = useMemo(() => Array.from(new Set([...tasks.map(task => task.tenant).filter(Boolean), tenantFilter].filter(Boolean))).sort(), [tasks, tenantFilter])
  const activeBoardMeta = boards.find(board => board.slug === activeBoard)
  const activeBoardName = activeBoardMeta?.name ?? activeBoard
  const formatTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#0d1323', position: 'relative' }} onClick={() => setShowBoardMenu(false)}>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/bg-overview.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.07 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(13,19,35,0.8) 0%, rgba(13,19,35,0.3) 50%, rgba(13,19,35,0.85) 100%)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 10 }}>
        <TopAppBar breadcrumb={['Hermes', 'Kanban', activeBoardName]} />
      </div>

      <div className="flex flex-wrap items-center justify-between px-6 py-3 shrink-0 gap-3" style={{ position: 'relative', zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(13,19,35,0.7)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative" onClick={event => event.stopPropagation()}>
            <button onClick={() => setShowBoardMenu(value => !value)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#dde2f9' }}>
              <LayoutGrid size={11} style={{ color: activeBoardMeta?.color ?? '#3cd7ff' }} />
              <span>{activeBoardMeta?.icon ? `${activeBoardMeta.icon} ` : ''}{activeBoardName}</span>
              <ChevronDown size={11} style={{ color: '#859398', transform: showBoardMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {showBoardMenu && (
              <div className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden" style={{ background: '#131b2e', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 260, zIndex: 100 }}>
                {boards.map(board => (
                  <div key={board.slug} className="flex items-center group" style={{ background: board.slug === activeBoard ? 'rgba(60,215,255,0.08)' : 'transparent' }}>
                    <button onClick={() => { setActiveBoard(board.slug); setShowBoardMenu(false) }} className="flex-1 text-left px-4 py-2.5 text-[11px] font-mono transition-colors" style={{ color: board.slug === activeBoard ? '#3cd7ff' : '#dde2f9' }}>
                      {board.icon ? `${board.icon} ` : ''}{board.name}
                    </button>
                    {board.slug !== 'default' && (
                      <button onClick={event => { event.stopPropagation(); void handleDeleteBoard(board.slug) }} disabled={deletingBoard === board.slug} className="opacity-0 group-hover:opacity-100 px-2 py-2.5 transition-opacity" style={{ color: '#f43f5e' }} title={`Archive board \"${board.name}\"`}>
                        {deletingBoard === board.slug ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
                      </button>
                    )}
                  </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <button onClick={() => { setShowNewBoard(true); setShowBoardMenu(false) }} className="w-full text-left px-4 py-2.5 text-[11px] font-mono flex items-center gap-2 transition-colors" style={{ color: '#5df6e0' }}>
                    <Plus size={11} /> New Board
                  </button>
                </div>
              </div>
            )}
          </div>

          <span className="text-[10px] font-mono" style={{ color: '#859398' }}>{tasks.length} tasks</span>
          <span className="text-[10px] font-mono uppercase" style={{ color: boardBackend === 'native' ? '#5df6e0' : '#859398' }}>{boardBackend}</span>
          {activeBoardMeta?.description && <span className="text-[10px] font-mono" style={{ color: '#859398' }}>{activeBoardMeta.description}</span>}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-56">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#859398' }} />
            <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search tasks..." className="w-full pl-8 pr-3 py-1.5 rounded-lg text-[11px] font-mono" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#dde2f9', outline: 'none' }} />
          </div>

          <select value={tenantFilter} onChange={event => setTenantFilter(event.target.value)} className="px-2 py-1.5 rounded-lg text-[11px] font-mono" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#dde2f9' }}>
            <option value="">All tenants</option>
            {tenants.map(tenant => <option key={tenant} value={tenant}>{tenant}</option>)}
          </select>

          <select value={assigneeFilter} onChange={event => setAssigneeFilter(event.target.value)} className="px-2 py-1.5 rounded-lg text-[11px] font-mono" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#dde2f9' }}>
            <option value="">All assignees</option>
            {assignees.map(assignee => <option key={assignee} value={assignee}>{assignee}</option>)}
          </select>

          <label className="flex items-center gap-2 text-[11px] font-mono" style={{ color: '#859398' }}>
            <input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} />
            Show archived
          </label>

          <div className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: '#859398' }}>
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            {formatTime(lastUpdated)}
          </div>
          <button onClick={() => void fetchTasks()} className="px-3 py-1.5 rounded-lg text-[11px] font-mono" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#dde2f9' }}>Refresh</button>
          <button onClick={() => setShowNewModal(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all" style={{ background: 'rgba(93,246,224,0.08)', border: '1px solid rgba(93,246,224,0.22)', color: '#5df6e0' }}>
            <Plus size={13} /> New Task
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 py-4" style={{ position: 'relative', zIndex: 5 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[11px] font-mono animate-pulse" style={{ color: '#5df6e0' }}>Loading board...</div>
          </div>
        ) : (
          <div className="flex gap-4 h-full pb-2" style={{ minWidth: 'max-content' }}>
            {KANBAN_COLUMNS.filter(column => includeArchived || column.status !== 'archived').map(column => (
              <div key={column.status} className="h-full" style={{ width: 240 }}>
                <KanbanColumn status={column.status} label={column.label} color={column.color} tasks={tasksByStatus[column.status] ?? []} onTaskClick={setSelectedTask} onDrop={handleDrop} />
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          availableTasks={tasks}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdate}
          onTaskSync={task => replaceTask(task.taskId, task)}
          onRefreshBoard={fetchTasks}
          onLaunchInChat={task => void handleLaunchInChat(task)}
        />
      )}

      {showNewModal && <NewTaskModal availableTasks={tasks} onClose={() => setShowNewModal(false)} onCreate={handleCreate} />}
      {showNewBoard && <NewBoardModal onClose={() => setShowNewBoard(false)} onCreate={handleCreateBoard} />}
    </div>
  )
}
