import TopAppBar from '@/components/layout/TopAppBar'
import NativeKanbanUnavailable from '@/components/kanban/NativeKanbanUnavailable'
import HermesNativeKanbanHost from '@/components/kanban/HermesNativeKanbanHost'

export const dynamic = 'force-dynamic'

// Endpoint discovery is warmed by the root layout (app/layout.tsx) on every
// request, so by the time this page renders the ECS IP cache is already hot.

const PLUGIN_SCRIPT = '/api/hermes/dashboard-plugins/kanban/dist/index.js'
const PLUGIN_STYLES = '/api/hermes/dashboard-plugins/kanban/dist/style.css'

export default function KanbanPage() {
  // The native kanban host posts to /api/hermes/* which resolves the upstream
  // via lib/hermesEndpoint.ts. That falls back to ECS auto-discovery when
  // HERMES_DASHBOARD_URL is unset (the Vercel-deploy case), so the only thing
  // truly required to wire things up is the shared secret.
  const configured = Boolean(process.env.HERMES_SECRET_KEY?.trim())
  if (!configured) return <NativeKanbanUnavailable />

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Preload the plugin bundle + stylesheet from the SSR'd HTML so the browser
          starts fetching them in parallel with the React bundle, instead of waiting
          for hydration + useEffect inside HermesNativeKanbanHost. Next 14 hoists
          <link> tags out of the body automatically. */}
      <link rel="preload" as="style" href={PLUGIN_STYLES} />
      <link rel="preload" as="script" href={PLUGIN_SCRIPT} />

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
