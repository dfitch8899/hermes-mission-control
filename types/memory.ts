export type MemoryType = 'context' | 'skill' | 'improvement'

export type Memory = {
  memoryId: string
  createdAt: string
  title: string
  content: string
  type: MemoryType
  tags: string[]
  source: 'hermes' | 'user'
  relevanceScore: number
  updatedAt: string
  relatedTaskIds?: string[]
  version: number
}
