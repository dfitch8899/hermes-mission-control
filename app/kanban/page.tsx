import TopAppBar from '@/components/layout/TopAppBar'
import NativeKanbanUnavailable from '@/components/kanban/NativeKanbanUnavailable'
import HermesNativeKanbanHost from '@/components/kanban/HermesNativeKanbanHost'

export const dynamic = 'force-dynamic'

export default function KanbanPage() {
  const configured = Boolean(process.env.HERMES_DASHBOARD_URL?.trim())
  if (!configured) return <NativeKanbanUnavailable />

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <TopAppBar breadcrumb={['Kanban']} />
      <HermesNativeKanbanHost />
    </div>
  )
}
