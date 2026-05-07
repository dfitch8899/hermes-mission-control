export type HermesKanbanMode = 'legacy' | 'hybrid' | 'native'

function normalizeMode(value: string | undefined): HermesKanbanMode {
  const mode = (value ?? 'legacy').trim().toLowerCase()
  if (mode === 'hybrid' || mode === 'native') return mode
  return 'legacy'
}

function normalizeUrl(value: string | undefined): string | null {
  const url = (value ?? '').trim()
  if (!url) return null
  return url.replace(/\/$/, '')
}

export const hermesConfig = {
  kanbanMode: normalizeMode(process.env.HERMES_KANBAN_MODE),
  kanbanBridgeUrl: normalizeUrl(process.env.HERMES_KANBAN_BRIDGE_URL) ?? normalizeUrl(process.env.HERMES_DASHBOARD_URL),
}

export function canUseNativeKanban() {
  return hermesConfig.kanbanMode !== 'legacy' && !!hermesConfig.kanbanBridgeUrl
}
