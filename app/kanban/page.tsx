import TopAppBar from '@/components/layout/TopAppBar'
import NativeKanbanUnavailable from '@/components/kanban/NativeKanbanUnavailable'
import HermesNativeKanbanHost from '@/components/kanban/HermesNativeKanbanHost'

export const dynamic = 'force-dynamic'

export default function KanbanPage() {
  const configured = Boolean(process.env.HERMES_DASHBOARD_URL?.trim())
  if (!configured) return <NativeKanbanUnavailable />

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Subtle accent overlay — matches other MC pages (agents, calendar, memory).
          The body's own ambient gradient + grid (globals.css) reads through this. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 900px 600px at 50% 0%, rgba(60, 215, 255, 0.05) 0%, transparent 60%)',
          zIndex: 0,
        }}
      />

      <TopAppBar breadcrumb={['Hermes', 'Kanban']} />

      <div className="flex-1 flex flex-col overflow-hidden relative" style={{ zIndex: 2 }}>
        <HermesNativeKanbanHost />
      </div>
    </div>
  )
}
