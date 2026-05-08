export type HermesKanbanMode = 'legacy' | 'hybrid' | 'native'
export type HermesKanbanConfigState = 'native-ready' | 'native-missing-bridge' | 'legacy-explicit'

function normalizeMode(value: string | undefined): HermesKanbanMode {
  const mode = (value ?? 'native').trim().toLowerCase()
  if (mode === 'legacy' || mode === 'hybrid' || mode === 'native') return mode
  return 'native'
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

export function getHermesKanbanConfigState(): HermesKanbanConfigState {
  if (hermesConfig.kanbanMode === 'legacy') return 'legacy-explicit'
  if (!hermesConfig.kanbanBridgeUrl) return 'native-missing-bridge'
  return 'native-ready'
}

export function canUseNativeKanban() {
  return getHermesKanbanConfigState() === 'native-ready'
}
