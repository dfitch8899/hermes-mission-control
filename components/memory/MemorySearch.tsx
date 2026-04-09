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
      className="flex items-center gap-3 px-4 h-11 rounded transition-all duration-150"
      style={{
        backgroundColor: '#1C2128',
        border: focused ? '0.5px solid #FFB300' : '0.5px solid #30363D',
      }}
    >
      <Search size={15} style={{ color: '#484F58', flexShrink: 0 }} />
      <input
        type="text"
        placeholder="Search memories by title, content, or tags..."
        className="bg-transparent border-none outline-none flex-1 text-[13px] placeholder:opacity-40"
        style={{ color: '#E6EDF3', fontFamily: 'var(--font-inter)' }}
        value={value}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {value && (
        <button
          onClick={() => { setValue(''); onSearch('') }}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{ color: '#8B949E', backgroundColor: '#0D1117', border: '0.5px solid #30363D' }}
        >
          clear
        </button>
      )}
    </div>
  )
}
