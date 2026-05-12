import TopAppBar from '@/components/layout/TopAppBar'
import NativeKanbanUnavailable from '@/components/kanban/NativeKanbanUnavailable'

export const dynamic = 'force-dynamic'

export default function KanbanPage() {
  const configured = Boolean(process.env.HERMES_DASHBOARD_URL?.trim())
  if (!configured) return <NativeKanbanUnavailable />

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <TopAppBar breadcrumb={['Kanban']} />
      <iframe
        src="/api/hermes/kanban"
        title="Hermes Kanban"
        className="flex-1 w-full border-0"
      />
    </div>
  )
}
