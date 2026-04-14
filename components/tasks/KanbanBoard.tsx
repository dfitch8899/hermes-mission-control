'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { Task, TaskStatus } from '@/types/task'
import KanbanColumn from './KanbanColumn'
import TaskCard from './TaskCard'
import TaskSlideOver from './TaskSlideOver'

interface KanbanBoardProps {
  initialTasks: Task[]
  onRegisterAddTask?: (fn: (task: Task) => void) => void
}

const COLUMNS: { status: TaskStatus; label: string; accentColor: string }[] = [
  { status: 'suggested', label: 'Suggested', accentColor: '#8B949E' },
  { status: 'queued', label: 'Queued', accentColor: '#388BFD' },
  { status: 'in_progress', label: 'In Progress', accentColor: '#FFB300' },
  { status: 'done', label: 'Done', accentColor: '#3FB950' },
  { status: 'possible', label: 'Possible', accentColor: '#14B8A6' },
]

export default function KanbanBoard({ initialTasks, onRegisterAddTask }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)

  useEffect(() => {
    if (onRegisterAddTask) {
      onRegisterAddTask((task: Task) => {
        setTasks((prev) => [task, ...prev])
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [slideOverOpen, setSlideOverOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const getTasksByStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status)

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.taskId === event.active.id)
    setActiveTask(task || null)
  }

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const activeTask = tasks.find((t) => t.taskId === active.id)
    if (!activeTask) return

    // If dropped on a column droppable
    const newStatus = over.id as TaskStatus
    const isColumn = COLUMNS.some((c) => c.status === newStatus)

    if (isColumn && activeTask.status !== newStatus) {
      // Optimistic update
      const updatedTask = { ...activeTask, status: newStatus, updatedAt: new Date().toISOString() }
      setTasks((prev) => prev.map((t) => (t.taskId === activeTask.taskId ? updatedTask : t)))

      // API call
      try {
        await fetch(`/api/tasks/${activeTask.taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
      } catch {
        // Rollback
        setTasks((prev) => prev.map((t) => (t.taskId === activeTask.taskId ? activeTask : t)))
      }
    } else if (!isColumn) {
      // Reorder within same column
      const overTask = tasks.find((t) => t.taskId === over.id)
      if (overTask && activeTask.status === overTask.status) {
        const columnTasks = getTasksByStatus(activeTask.status)
        const oldIndex = columnTasks.findIndex((t) => t.taskId === active.id)
        const newIndex = columnTasks.findIndex((t) => t.taskId === over.id)
        const reordered = arrayMove(columnTasks, oldIndex, newIndex)
        setTasks((prev) => {
          const others = prev.filter((t) => t.status !== activeTask.status)
          return [...others, ...reordered]
        })
      }
    }
  }, [tasks])

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
    setSlideOverOpen(true)
  }

  const handleSave = async (updated: Task) => {
    const res = await fetch(`/api/tasks/${updated.taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    if (res.ok) {
      const data = await res.json()
      setTasks((prev) => prev.map((t) => (t.taskId === updated.taskId ? (data.task || updated) : t)))
    }
  }

  const handleDelete = async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
    setTasks((prev) => prev.filter((t) => t.taskId !== taskId))
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-full overflow-x-auto px-6 pb-6 pt-4">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              label={col.label}
              tasks={getTasksByStatus(col.status)}
              accentColor={col.accentColor}
              onTaskClick={handleTaskClick}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <div style={{ opacity: 0.85 }}>
              <TaskCard task={activeTask} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <TaskSlideOver
        task={selectedTask}
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </>
  )
}
