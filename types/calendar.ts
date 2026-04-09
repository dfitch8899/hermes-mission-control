export type CalendarEvent = {
  eventId: string
  scheduledAt: string
  title: string
  type: 'cron' | 'planned'
  cronExpression?: string
  cronHumanReadable?: string
  nextRun: string
  lastRun?: string
  lastRunStatus?: 'success' | 'failed' | 'running' | 'never'
  ecsTaskDefinition?: string
  description?: string
  createdBy: string
}
