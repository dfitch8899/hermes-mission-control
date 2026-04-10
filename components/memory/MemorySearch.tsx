'use client'

import { Search } from 'lucide-react'
import { useState } from 'react'

interface MemorySearchProps {
  onSearch: (query: string) => void
}

export default function MemorySearch({ onSearch }: MemorySearchProps) {
  const [focused, setFocused] = useState(false)
  const [value, setValue] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
    onSearch(e.target.value)
  }

  return (
    <div
      className="flex items-center gap-3 px-4 h-11 rounded-xl transition-all duration-200"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: focused ? '1px solid rgba(60,215,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <Search size={15} className="text-outline shrink-0" />
      <input
        type="text"
        placeholder="Search memories by title, content, or tags..."
        className="bg-transparent border-none outline-none flex-1 text-[13px] placeholder:opacity-30 text-on-surface"
        style={{ fontFamily: 'var(--font-inter)' }}
        value={value}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {value && (
        <button
          onClick={() => { setValue(''); onSearch('') }}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded text-outline"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          clear
        </button>
      )}
    </div>
  )
}
