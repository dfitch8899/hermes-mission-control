'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import TopAppBar from '@/components/layout/TopAppBar'
import { ArrowUp } from 'lucide-react'

interface ToolCallInfo {
  tool: string
  input: Record<string, unknown>
  result?: unknown
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallInfo[]
}

function formatToolChip(tc: ToolCallInfo): string {
  const inp = tc.input as Record<string, unknown>
  switch (tc.tool) {
    case 'create_task':
      return `Created task: "${inp.title}"`
    case 'list_tasks':
      return inp.status ? `Listed ${inp.status} tasks` : 'Listed all tasks'
    case 'create_memory':
      return `Stored memory: "${inp.title}"`
    case 'list_memories':
      return 'Listed all memories'
    default:
      return `Called: ${tc.tool}`
  }
}

function ToolChip({ tc }: { tc: ToolCallInfo }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium mb-2 mr-1"
      style={{
        background: 'rgba(93, 246, 224, 0.08)',
        border: '1px solid rgba(93, 246, 224, 0.2)',
        color: '#5df6e0',
      }}
    >
      <span style={{ fontSize: 11 }}>⚡</span>
      {formatToolChip(tc)}
    </div>
  )
}

function UserBubble({ message }: { message: Message }) {
  return (
    <div className="flex justify-end mb-4 animate-fade-in-up">
      <div
        className="max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
        style={{
          background: 'rgba(60, 215, 255, 0.08)',
          border: '1px solid rgba(60, 215, 255, 0.15)',
          color: '#dde2f9',
          fontFamily: 'var(--font-inter)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.content}
      </div>
    </div>
  )
}

function AssistantBubble({ message }: { message: Message }) {
  return (
    <div className="flex items-start gap-3 mb-4 animate-fade-in-up">
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-headline font-black text-xs mt-0.5"
        style={{
          background: 'linear-gradient(135deg, #3cd7ff, #5df6e0)',
          color: '#001f27',
          boxShadow: '0 0 12px rgba(60, 215, 255, 0.3)',
        }}
      >
        H
      </div>

      <div className="flex-1 min-w-0">
        {/* Tool chips */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap mb-1">
            {message.toolCalls.map((tc, i) => (
              <ToolChip key={i} tc={tc} />
            ))}
          </div>
        )}

        {/* Message bubble */}
        {message.content && (
          <div
            className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
            style={{
              backdropFilter: 'blur(12px)',
              background: 'rgba(47, 52, 70, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              color: '#dde2f9',
              fontFamily: 'var(--font-inter)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {message.content}
          </div>
        )}
      </div>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-headline font-black text-xs"
        style={{
          background: 'linear-gradient(135deg, #3cd7ff, #5df6e0)',
          color: '#001f27',
          boxShadow: '0 0 12px rgba(60, 215, 255, 0.3)',
        }}
      >
        H
      </div>
      <div
        className="px-4 py-3 rounded-2xl text-xs font-mono"
        style={{
          backdropFilter: 'blur(12px)',
          background: 'rgba(47, 52, 70, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          color: '#5df6e0',
        }}
      >
        <span className="animate-pulse-glow">Hermes is thinking...</span>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'Hello. I\'m Hermes, your mission control AI. Tell me what you need — I can create tasks, manage memories, and more.',
    },
  ])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const maxH = 4 * 24 + 32 // 4 rows approx
    ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px'
  }, [input])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)

    // Build conversation history for API (exclude our greeting seed since it wasn't from API)
    const history = [...messages, userMsg]
      .filter(m => m.id !== '0') // skip seed assistant message
      .map(m => ({ role: m.role, content: m.content }))

    // Add a placeholder assistant message
    const assistantId = (Date.now() + 1).toString()
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
    }
    setMessages(prev => [...prev, assistantMsg])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          let event: { type: string; delta?: string; tool?: string; input?: Record<string, unknown>; result?: unknown; message?: string }
          try {
            event = JSON.parse(raw)
          } catch {
            continue
          }

          if (event.type === 'text' && event.delta) {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: m.content + event.delta! }
                  : m
              )
            )
          } else if (event.type === 'tool_call') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: [
                        ...(m.toolCalls ?? []),
                        { tool: event.tool!, input: event.input ?? {} },
                      ],
                    }
                  : m
              )
            )
          } else if (event.type === 'tool_result') {
            setMessages(prev =>
              prev.map(m => {
                if (m.id !== assistantId) return m
                const tcs = [...(m.toolCalls ?? [])]
                // update last tool call that matches this tool name with result
                for (let i = tcs.length - 1; i >= 0; i--) {
                  if (tcs[i].tool === event.tool && tcs[i].result === undefined) {
                    tcs[i] = { ...tcs[i], result: event.result }
                    break
                  }
                }
                return { ...m, toolCalls: tcs }
              })
            )
          } else if (event.type === 'error') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: `Error: ${event.message}` }
                  : m
              )
            )
          }
        }
      }
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `Connection error: ${String(err)}` }
            : m
        )
      )
    } finally {
      setIsStreaming(false)
    }
  }, [input, isStreaming, messages])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#0d1323', position: 'relative' }}>
      {/* Background image + gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'url(/bg-overview.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(13,19,35,0.6) 0%, rgba(13,19,35,0.2) 40%, rgba(13,19,35,0.7) 100%)',
          }}
        />
      </div>

      {/* Top bar */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        <TopAppBar breadcrumb={['Hermes', 'Chat']} />
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto px-6 pt-6"
        style={{ position: 'relative', zIndex: 5, paddingBottom: '120px' }}
      >
        <div className="max-w-3xl mx-auto">
          {messages.map(msg =>
            msg.role === 'user' ? (
              <UserBubble key={msg.id} message={msg} />
            ) : (
              <AssistantBubble key={msg.id} message={msg} />
            )
          )}

          {/* Thinking indicator: show when streaming and last message is empty assistant placeholder */}
          {isStreaming && (() => {
            const last = messages[messages.length - 1]
            return last?.role === 'assistant' && !last.content && (!last.toolCalls || last.toolCalls.length === 0)
          })() && <ThinkingIndicator />}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Fixed input bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          left: '80px', // sidebar width
          zIndex: 20,
          background: 'rgba(13, 19, 35, 0.8)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '16px 24px',
        }}
      >
        <div className="max-w-3xl mx-auto flex items-end gap-3">
          <div
            className="flex-1 flex items-end gap-2 px-4 py-3 rounded-2xl"
            style={{
              background: 'rgba(47, 52, 70, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell Hermes what to do..."
              rows={1}
              disabled={isStreaming}
              className="flex-1 bg-transparent border-none outline-none resize-none text-sm leading-6 placeholder:opacity-30"
              style={{
                color: '#dde2f9',
                fontFamily: 'var(--font-inter)',
                maxHeight: '96px',
                overflowY: 'auto',
              }}
            />
          </div>

          {/* Send button */}
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="flex items-center justify-center rounded-xl w-10 h-10 shrink-0 active:scale-95 transition-transform"
            style={{
              background: input.trim() && !isStreaming
                ? 'linear-gradient(135deg, #3cd7ff, #5df6e0)'
                : 'rgba(60, 215, 255, 0.1)',
              border: '1px solid rgba(60, 215, 255, 0.2)',
              color: input.trim() && !isStreaming ? '#001f27' : 'rgba(60, 215, 255, 0.4)',
              cursor: input.trim() && !isStreaming ? 'pointer' : 'not-allowed',
              boxShadow: input.trim() && !isStreaming ? '0 0 16px rgba(60, 215, 255, 0.3)' : 'none',
              transition: 'background 0.2s, color 0.2s, box-shadow 0.2s',
            }}
          >
            <ArrowUp size={16} />
          </button>
        </div>

        <div
          className="max-w-3xl mx-auto mt-2 text-center text-[10px] font-mono"
          style={{ color: 'rgba(133, 147, 152, 0.4)' }}
        >
          Enter to send · Shift+Enter for newline
        </div>
      </div>
    </div>
  )
}
