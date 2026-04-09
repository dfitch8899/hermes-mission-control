'use client'

import { useState, useRef, useEffect } from 'react'

interface TerminalInputProps {
  onCommand: (cmd: string) => void
  disabled?: boolean
  prompt?: string
}

export default function TerminalInput({ onCommand, disabled, prompt = '▸ HERMES ~$ ' }: TerminalInputProps) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!disabled) inputRef.current?.focus()
  }, [disabled])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const cmd = value.trim()
      if (cmd) {
        setHistory((prev) => [...prev, cmd])
        setHistoryIndex(-1)
        onCommand(cmd)
        setValue('')
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(newIndex)
      if (history[newIndex] !== undefined) setValue(history[newIndex])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newIndex = historyIndex === -1 ? -1 : Math.min(history.length - 1, historyIndex + 1)
      setHistoryIndex(newIndex)
      setValue(newIndex === -1 || newIndex >= history.length ? '' : history[newIndex])
    }
  }

  return (
    <div
      className="h-14 shrink-0 flex items-center px-5 gap-2"
      style={{
        backgroundColor: '#0A0E14',
        borderTop: '0.5px solid #30363D',
        fontFamily: 'var(--font-jetbrains-mono)',
        fontSize: '13px',
      }}
    >
      <span
        className="shrink-0 font-bold"
        style={{ color: '#FFB300' }}
      >
        {prompt}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="flex-1 bg-transparent border-none outline-none caret-amber"
        style={{
          color: '#E6EDF3',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: '13px',
          caretColor: '#FFB300',
        }}
        placeholder={disabled ? 'Processing...' : ''}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {disabled && (
        <div className="w-2 h-4 rounded-sm animate-pulse" style={{ backgroundColor: '#FFB300' }} />
      )}
    </div>
  )
}
