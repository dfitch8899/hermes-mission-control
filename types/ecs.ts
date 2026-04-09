export type EcsMetrics = {
  cpu: number
  memory: number
  taskCount: number
  uptime: number
}

export type EcsLogLine = {
  timestamp: number
  message: string
}

export type EcsTask = {
  taskArn: string
  taskDefinitionArn: string
  lastStatus: string
  desiredStatus: string
  cpu: string
  memory: string
  startedAt?: Date
  group?: string
}
