'use client'

import { useState, useEffect } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import MemoryGrid from '@/components/memory/MemoryGrid'
import { MOCK_MEMORIES } from '@/lib/mockData'
import type { Memory } from '@/types/memory'

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>(MOCK_MEMORIES)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/memories')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.memories?.length) setMemories(d.memories)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopAppBar breadcrumb={['Hermes', 'Memory']} />
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[12px] font-mono text-outline">
          Loading memories...
        </div>
      ) : (
        <MemoryGrid initialMemories={memories} />
      )}
    </div>
  )
}
