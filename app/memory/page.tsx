'use client'

import { useState, useEffect, useCallback } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import MemoryGrid from '@/components/memory/MemoryGrid'
import { MOCK_MEMORIES } from '@/lib/mockData'
import type { Memory } from '@/types/memory'

interface SyncMeta {
  lastSyncedAt: string | null
  skillCount: number
  memoryCount: number
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'never'
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function MemoryPage() {
  const [memories, setMemories]   = useState<Memory[]>(MOCK_MEMORIES)
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const [syncMeta, setSyncMeta]   = useState<SyncMeta | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const fetchMemories = useCallback(async () => {
    try {
      const r = await fetch('/api/memories')
      if (!r.ok) return
      const d = await r.json()
      if (d?.memories?.length) setMemories(d.memories)
    } catch {
      /* silent */
    }
  }, [])

  const fetchSyncMeta = useCallback(async () => {
    try {
      const r = await fetch('/api/hermes/sync')
      if (r.ok) setSyncMeta(await r.json())
    } catch {
      /* silent */
    }
  }, [])

  useEffect(() => {
    Promise.all([fetchMemories(), fetchSyncMeta()])
      .finally(() => setLoading(false))
  }, [fetchMemories, fetchSyncMeta])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      const r = await fetch('/api/hermes/sync', { method: 'POST' })
      const d = await r.json()
      if (d.lastSyncedAt) setSyncMeta(d)
      // Re-fetch memories after sync
      await fetchMemories()
    } catch {
      setSyncError('Sync failed — check that Hermes is online.')
    } finally {
      setSyncing(false)
    }
  }, [fetchMemories])

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'url(/bg-memory.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.1, zIndex: 0 }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 70% 30%, transparent 25%, #0d1323 70%)', zIndex: 1 }}
      />

      <TopAppBar breadcrumb={['Hermes', 'Memory']} />

      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Sync status bar */}
        <div
          className="flex items-center justify-between px-6 py-2 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(13,19,35,0.6)' }}
        >
          <div className="flex items-center gap-4 text-[10px] font-mono" style={{ color: '#859398' }}>
            {syncMeta ? (
              <>
                <span>
                  <span style={{ color: '#5df6e0' }}>{syncMeta.skillCount}</span> skills
                </span>
                <span>
                  <span style={{ color: '#5df6e0' }}>{syncMeta.memoryCount}</span> memories
                </span>
                <span>synced {formatRelativeTime(syncMeta.lastSyncedAt)}</span>
              </>
            ) : (
              <span>loading sync status...</span>
            )}
            {syncError && (
              <span style={{ color: '#ff6b6b' }}>{syncError}</span>
            )}
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-mono transition-all duration-150"
            style={{
              background: syncing ? 'rgba(93,246,224,0.05)' : 'rgba(93,246,224,0.08)',
              border: '1px solid rgba(93,246,224,0.2)',
              color: syncing ? 'rgba(93,246,224,0.4)' : '#5df6e0',
              cursor: syncing ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={e => { if (!syncing) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(93,246,224,0.14)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = syncing ? 'rgba(93,246,224,0.05)' : 'rgba(93,246,224,0.08)' }}
          >
            <span style={{ display: 'inline-block', transition: 'transform 0.3s', transform: syncing ? 'rotate(360deg)' : 'rotate(0deg)' }}>
              ↻
            </span>
            {syncing ? 'Syncing...' : 'Sync from Hermes'}
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[12px] font-mono text-outline">
            Loading memories...
          </div>
        ) : (
          <MemoryGrid initialMemories={memories} />
        )}
      </div>

    </div>
  )
}
