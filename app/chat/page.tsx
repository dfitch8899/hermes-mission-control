'use client'

import { Suspense, useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import TopAppBar from '@/components/layout/TopAppBar'
import AgentPickerModal from '@/components/agents/AgentPickerModal'
import { ArrowUp, AlertTriangle, CheckCircle, XCircle, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { Agent } from '@/types/agent'

// ─── Types ─────────────────────────────────────────────────────────────────

interface ToolCallInfo {
  tool: string
  input: Record<string, unknown>
  result?: unknown
}

interface PendingPermission {
  ts: string
  channel: string
  command: string
  reason: string
  status: 'pending' | 'approved' | 'denied'
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallInfo[]
  permissions?: PendingPermission[]
}

interface ChatSummary {
  chatId:    string
  title:     string
  preview:   string
  agentId:   string
  createdAt: string
  updatedAt: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const WELCOME: Message = {
  id: '__welcome__',
  role: 'assistant',
  content: "Hello. I'm Hermes, your mission control AI. Tell me what you need — I can create tasks, manage memories, and more.",
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return ''
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatToolChip(tc: ToolCallInfo): string {
  const inp = tc.input as Record<string, unknown>
  switch (tc.tool) {
    case 'create_task':   return `Created task: "${inp.title}"`
    case 'list_tasks':    return inp.status ? `Listed ${inp.status} tasks` : 'Listed all tasks'
    case 'create_memory': return `Stored memory: "${inp.title}"`
    case 'list_memories': return 'Listed all memories'
    default:              return `Called: ${tc.tool}`
  }
}

// ─── Small UI pieces ────────────────────────────────────────────────────────

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

// ─── Orchestrator rendering ─────────────────────────────────────────────────

interface OrchestratorStep {
  id: number
  total: number
  goal: string
  status: 'running' | 'done' | 'failed'
  error?: string
}

interface OrchestratorPlan {
  totalSteps: number
  goals: string[]
  steps: OrchestratorStep[]
}

function parseOrchestratorContent(content: string): { plan: OrchestratorPlan | null; finalText: string } {
  if (!content.includes('📋 Plan:')) {
    return { plan: null, finalText: content }
  }

  // Find where the orchestrator section starts
  const planIdx = content.indexOf('📋 Plan:')

  // The preamble before the plan (usually empty, but keep in case)
  const preamble = content.substring(0, planIdx)

  // Split orchestrator section from final text at the last \n\n before any non-marker line
  const afterPlan = content.substring(planIdx)
  const doubleNl = afterPlan.indexOf('\n\n')
  let orchSection = afterPlan
  let finalText   = ''

  if (doubleNl !== -1) {
    orchSection = afterPlan.substring(0, doubleNl)
    finalText   = afterPlan.substring(doubleNl + 2)
  }

  // Parse plan header: "📋 Plan: N step(s)"
  const planMatch = orchSection.match(/📋 Plan:\s*(\d+)\s*steps?/)
  if (!planMatch) return { plan: null, finalText: content }
  const totalSteps = parseInt(planMatch[1], 10)

  // Parse goal list lines:  "  1. goal"
  const goals: string[] = []
  for (const line of orchSection.split('\n')) {
    const m = line.match(/^\s{1,4}(\d+)\.\s+(.+)$/)
    if (m) goals.push(m[2].trim())
  }

  // Parse steps
  const stepMap: Record<number, OrchestratorStep> = {}
  const startRe = /⚙️ Step\s+(\d+)\/(\d+):\s+(.+)/
  const doneRe  = /✅ Step\s+(\d+)\/(\d+)\s+done/
  const failRe  = /⚠️ Step\s+(\d+)\/(\d+)\s+failed:\s+(.+)/

  for (const line of orchSection.split('\n')) {
    const sm = line.match(startRe)
    if (sm) {
      const id = parseInt(sm[1], 10)
      stepMap[id] = { id, total: parseInt(sm[2], 10), goal: sm[3].trim(), status: 'running' }
    }
    const dm = line.match(doneRe)
    if (dm) {
      const id = parseInt(dm[1], 10)
      if (stepMap[id]) stepMap[id].status = 'done'
    }
    const fm = line.match(failRe)
    if (fm) {
      const id = parseInt(fm[1], 10)
      if (stepMap[id]) { stepMap[id].status = 'failed'; stepMap[id].error = fm[3].trim() }
    }
  }

  const steps = Object.values(stepMap).sort((a, b) => a.id - b.id)
  const plan: OrchestratorPlan = { totalSteps, goals, steps }

  // If there's preamble, prepend it to finalText
  const combinedFinal = preamble ? preamble.trim() + (finalText ? '\n\n' + finalText : '') : finalText
  return { plan, finalText: combinedFinal }
}

function OrchestratorBlock({ plan }: { plan: OrchestratorPlan }) {
  const [expanded, setExpanded] = useState(false)

  const doneCount = plan.steps.filter(s => s.status === 'done').length
  const failCount = plan.steps.filter(s => s.status === 'failed').length
  const allDone   = doneCount + failCount === plan.totalSteps && plan.totalSteps > 0

  return (
    <div className="mb-2" style={{ maxWidth: '80%' }}>
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(p => !p)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-mono font-medium transition-all duration-150 w-full"
        style={{
          background: 'rgba(93,246,224,0.06)',
          border: '1px solid rgba(93,246,224,0.18)',
          color: '#5df6e0',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(93,246,224,0.1)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(93,246,224,0.06)' }}
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span style={{ fontSize: 12 }}>📋</span>
        <span>
          Orchestration plan — {plan.totalSteps} step{plan.totalSteps !== 1 ? 's' : ''}
        </span>
        {allDone && (
          <span className="ml-auto" style={{ color: doneCount === plan.totalSteps ? '#5df6e0' : '#f97316' }}>
            {failCount > 0 ? `${failCount} failed` : '✓ done'}
          </span>
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div
          className="mt-1.5 rounded-xl overflow-hidden"
          style={{
            background: 'rgba(13,19,35,0.7)',
            border: '1px solid rgba(93,246,224,0.1)',
          }}
        >
          {/* Goals list */}
          {plan.goals.length > 0 && (
            <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {plan.goals.map((goal, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 py-0.5 text-[10px] font-mono"
                  style={{ color: 'rgba(180,190,220,0.6)' }}
                >
                  <span style={{ color: '#5df6e0', opacity: 0.5, minWidth: 16 }}>{i + 1}.</span>
                  <span>{goal}</span>
                </div>
              ))}
            </div>
          )}

          {/* Step chips */}
          {plan.steps.length > 0 && (
            <div className="px-3 py-2 flex flex-col gap-1">
              {plan.steps.map(step => {
                const statusColor =
                  step.status === 'done'    ? '#5df6e0' :
                  step.status === 'failed'  ? '#ff7070' :
                  '#ffc83c'
                const statusIcon =
                  step.status === 'done'   ? '✅' :
                  step.status === 'failed' ? '⚠️' :
                  '⚙️'

                return (
                  <div
                    key={step.id}
                    className="flex items-start gap-2 text-[10px] font-mono py-0.5"
                  >
                    <span>{statusIcon}</span>
                    <span style={{ color: statusColor, minWidth: 56 }}>
                      Step {step.id}/{step.total}
                    </span>
                    <span style={{ color: 'rgba(180,190,220,0.7)', flex: 1 }}>
                      {step.goal}
                      {step.status === 'failed' && step.error && (
                        <span style={{ color: '#ff9090', marginLeft: 4 }}>— {step.error}</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PermissionCard({
  perm,
  onDecision,
}: {
  perm: PendingPermission
  onDecision: (ts: string, decision: 'approve' | 'deny') => void
}) {
  const [loading, setLoading] = useState(false)

  const decide = async (decision: 'approve' | 'deny') => {
    setLoading(true)
    try {
      await fetch('/api/chat/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: perm.channel, messageTs: perm.ts, decision }),
      })
      onDecision(perm.ts, decision)
    } finally {
      setLoading(false)
    }
  }

  const isDone = perm.status !== 'pending'

  return (
    <div
      className="rounded-xl mb-3 overflow-hidden"
      style={{
        border: isDone
          ? perm.status === 'approved' ? '1px solid rgba(93,246,224,0.25)' : '1px solid rgba(255,80,80,0.25)'
          : '1px solid rgba(255,200,60,0.35)',
        background: isDone
          ? perm.status === 'approved' ? 'rgba(93,246,224,0.04)' : 'rgba(255,80,80,0.04)'
          : 'rgba(255,200,60,0.05)',
      }}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          color: isDone ? (perm.status === 'approved' ? '#5df6e0' : '#ff5050') : '#ffc83c',
        }}
      >
        {isDone
          ? perm.status === 'approved' ? <CheckCircle size={13} /> : <XCircle size={13} />
          : <AlertTriangle size={13} />}
        {isDone
          ? perm.status === 'approved' ? 'Approved' : 'Denied'
          : 'Command Approval Required'}
      </div>
      <div className="px-4 pt-3">
        <pre
          className="text-[11px] leading-relaxed rounded-lg px-3 py-2.5 overflow-x-auto"
          style={{
            background: 'rgba(0,0,0,0.35)',
            color: '#c8d0f0',
            fontFamily: 'var(--font-mono, monospace)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {perm.command}
        </pre>
      </div>
      {perm.reason && (
        <p className="px-4 pt-2 pb-3 text-[11px] leading-relaxed" style={{ color: 'rgba(180,190,220,0.7)' }}>
          {perm.reason}
        </p>
      )}
      {!isDone && (
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={() => decide('approve')}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
            style={{
              background: 'rgba(93,246,224,0.12)',
              border: '1px solid rgba(93,246,224,0.3)',
              color: '#5df6e0',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <CheckCircle size={12} /> Approve
          </button>
          <button
            onClick={() => decide('deny')}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
            style={{
              background: 'rgba(255,80,80,0.1)',
              border: '1px solid rgba(255,80,80,0.25)',
              color: '#ff7070',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <XCircle size={12} /> Deny
          </button>
        </div>
      )}
    </div>
  )
}

function UserBubble({ message }: { message: Message }) {
  return (
    <div className="flex justify-end mb-4 animate-fade-in-up">
      <div
        className="max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
        style={{
          background: 'rgba(60,215,255,0.08)',
          border: '1px solid rgba(60,215,255,0.15)',
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

function AssistantBubble({
  message,
  onPermissionDecision,
}: {
  message: Message
  onPermissionDecision: (msgId: string, permTs: string, decision: 'approve' | 'deny') => void
}) {
  const { plan, finalText } = parseOrchestratorContent(message.content)

  return (
    <div className="flex items-start gap-3 mb-4 animate-fade-in-up">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-headline font-black text-xs mt-0.5"
        style={{
          background: 'linear-gradient(135deg, #3cd7ff, #5df6e0)',
          color: '#001f27',
          boxShadow: '0 0 12px rgba(60,215,255,0.3)',
        }}
      >
        H
      </div>
      <div className="flex-1 min-w-0">
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap mb-1">
            {message.toolCalls.map((tc, i) => <ToolChip key={i} tc={tc} />)}
          </div>
        )}
        {/* Orchestrator plan block — rendered when markers are detected */}
        {plan && <OrchestratorBlock plan={plan} />}
        {message.permissions && message.permissions.length > 0 && (
          <div className="mb-2">
            {message.permissions.map(perm => (
              <PermissionCard
                key={perm.ts}
                perm={perm}
                onDecision={(ts, decision) => onPermissionDecision(message.id, ts, decision)}
              />
            ))}
          </div>
        )}
        {finalText && (
          <div
            className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
            style={{
              backdropFilter: 'blur(12px)',
              background: 'rgba(47,52,70,0.2)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: '#dde2f9',
              fontFamily: 'var(--font-inter)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {finalText}
          </div>
        )}
      </div>
    </div>
  )
}

function ThinkingIndicator({ status }: { status?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-headline font-black text-xs"
        style={{
          background: 'linear-gradient(135deg, #3cd7ff, #5df6e0)',
          color: '#001f27',
          boxShadow: '0 0 12px rgba(60,215,255,0.3)',
        }}
      >
        H
      </div>
      <div
        className="px-4 py-3 rounded-2xl text-xs font-mono"
        style={{
          backdropFilter: 'blur(12px)',
          background: 'rgba(47,52,70,0.2)',
          border: '1px solid rgba(255,255,255,0.07)',
          color: '#5df6e0',
        }}
      >
        <span className="animate-pulse-glow">{status || 'Hermes is thinking...'}</span>
      </div>
    </div>
  )
}

// ─── Chat history sidebar item ─────────────────────────────────────────────

// Agent color map (matches BUILTIN_AGENTS colors, fallback for unknown agents)
const AGENT_COLORS: Record<string, string> = {
  general:  '#3cd7ff',
  coding:   '#4ade80',
  marketing:'#f97316',
  research: '#a78bfa',
}
const AGENT_ICONS: Record<string, string> = {
  general:  '✨',
  coding:   '💻',
  marketing:'📢',
  research: '🔬',
}

function AgentDot({ agentId, color }: { agentId: string; color?: string }) {
  const dotColor = color ?? AGENT_COLORS[agentId] ?? '#3cd7ff'
  const icon     = AGENT_ICONS[agentId] ?? '✨'
  return (
    <span
      title={agentId}
      className="shrink-0 mr-1.5 text-[11px] leading-none"
      style={{ filter: `drop-shadow(0 0 4px ${dotColor}88)` }}
    >
      {icon}
    </span>
  )
}

function ChatHistoryItem({
  chat,
  isActive,
  onClick,
  onDelete,
}: {
  chat: ChatSummary
  isActive: boolean
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter') onClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative flex items-start px-3 py-2.5 cursor-pointer transition-all duration-100 select-none"
      style={{
        background: isActive ? 'rgba(93,246,224,0.08)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        borderLeft: `2px solid ${isActive ? '#5df6e0' : 'transparent'}`,
      }}
    >
      <div className="flex-1 min-w-0 pr-6">
        <div
          className="flex items-center text-[12px] font-medium leading-snug"
          style={{ color: isActive ? '#5df6e0' : '#dde2f9' }}
        >
          <AgentDot agentId={chat.agentId ?? 'general'} />
          <span className="truncate">{chat.title}</span>
        </div>
        <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: '#859398' }}>
          {formatRelativeTime(chat.updatedAt)}
        </div>
      </div>

      {/* Delete button — revealed on hover */}
      <button
        onClick={onDelete}
        tabIndex={-1}
        aria-label="Delete chat"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-opacity duration-100"
        style={{
          opacity: hovered ? 0.5 : 0,
          color: '#859398',
          pointerEvents: hovered ? 'auto' : 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ff7070' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = '#859398' }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────

function ChatPageContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  // Chat history
  const [chats, setChats]             = useState<ChatSummary[]>([])
  const [chatsLoading, setChatsLoading] = useState(true)
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const currentChatIdRef = useRef<string | null>(null)

  // Agent
  const [currentAgentId, setCurrentAgentId]   = useState<string>('general')
  const currentAgentIdRef                      = useRef<string>('general')
  const [agentPickerOpen, setAgentPickerOpen]  = useState(false)

  // Conversation
  const [messages, setMessages]       = useState<Message[]>([WELCOME])
  const [input, setInput]             = useState('')
  const [isStreaming, setIsStreaming]  = useState(false)
  const [streamStatus, setStreamStatus] = useState('')

  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const textareaRef     = useRef<HTMLTextAreaElement>(null)
  const autoExecutedRef = useRef(false)

  // Keep refs in sync
  const setChatId = (id: string | null) => {
    setCurrentChatId(id)
    currentChatIdRef.current = id
  }
  const setAgentId = (id: string) => {
    setCurrentAgentId(id)
    currentAgentIdRef.current = id
  }

  // ── Fetch chat list ──────────────────────────────────────────────────────

  const fetchChats = useCallback(async () => {
    try {
      const r = await fetch('/api/chats')
      if (r.ok) {
        const d = await r.json() as { chats: ChatSummary[] }
        setChats(d.chats ?? [])
      }
    } catch { /* silent */ } finally {
      setChatsLoading(false)
    }
  }, [])

  useEffect(() => { void fetchChats() }, [fetchChats])

  // ── Load a previous chat ─────────────────────────────────────────────────

  const loadChat = useCallback(async (chatId: string) => {
    try {
      const r = await fetch(`/api/chats/${chatId}`)
      if (!r.ok) return
      const d = await r.json() as { messages: Message[]; agentId?: string }
      setMessages(d.messages.length ? d.messages : [WELCOME])
      setChatId(chatId)
      setAgentId(d.agentId ?? 'general')
    } catch { /* silent */ }
  }, [])

  // ── New chat ─────────────────────────────────────────────────────────────

  const newChat = useCallback(() => {
    setMessages([WELCOME])
    setChatId(null)
    setAgentPickerOpen(true)
  }, [])

  // ── Delete a chat ────────────────────────────────────────────────────────

  const deleteChat = useCallback(async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation()
    setChats(prev => prev.filter(c => c.chatId !== chatId))
    if (currentChatIdRef.current === chatId) newChat()
    await fetch(`/api/chats/${chatId}`, { method: 'DELETE' }).catch(() => {/* silent */})
  }, [newChat])

  // ── Scroll to bottom ─────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // ── Auto-resize textarea ──────────────────────────────────────────────────

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 4 * 24 + 32) + 'px'
  }, [input])

  // ── Permission decisions ──────────────────────────────────────────────────

  const handlePermissionDecision = useCallback(
    (msgId: string, permTs: string, decision: 'approve' | 'deny') => {
      setMessages(prev =>
        prev.map(m => {
          if (m.id !== msgId) return m
          return {
            ...m,
            permissions: (m.permissions ?? []).map(p =>
              p.ts === permTs ? { ...p, status: decision === 'approve' ? 'approved' : 'denied' } : p
            ),
          }
        }),
      )
    },
    [],
  )

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || isStreaming) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text }
    setMessages(prev => [...prev.filter(m => m.id !== '__welcome__'), userMsg])
    setInput('')
    setIsStreaming(true)
    setStreamStatus('')

    const history = [...messages, userMsg]
      .filter(m => m.id !== '__welcome__')
      .map(m => ({ role: m.role, content: m.content }))

    const assistantId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', toolCalls: [], permissions: [] }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, chatId: currentChatIdRef.current, agentId: currentAgentIdRef.current }),
      })
      if (!res.body) throw new Error('No response body')

      const reader  = res.body.getReader()
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

          let event: {
            type: string
            text?: string
            tool?: string
            input?: Record<string, unknown>
            result?: unknown
            message?: string
            ts?: string
            channel?: string
            command?: string
            reason?: string
            chatId?: string
          }
          try { event = JSON.parse(raw) } catch { continue }

          if (event.type === 'chat_meta' && event.chatId) {
            // New chat was created server-side — store the ID
            setChatId(event.chatId)
          } else if (event.type === 'status') {
            setStreamStatus(event.message ?? '')
          } else if (event.type === 'done') {
            setStreamStatus('')
          } else if (event.type === 'text_replace' && event.text !== undefined) {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: event.text! } : m),
            )
            setStreamStatus('Hermes is working...')
          } else if (event.type === 'permission_request') {
            const perm: PendingPermission = {
              ts:      event.ts!,
              channel: event.channel!,
              command: event.command ?? '',
              reason:  event.reason  ?? '',
              status:  'pending',
            }
            setStreamStatus('Waiting for your approval...')
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, permissions: [...(m.permissions ?? []), perm] }
                  : m,
              ),
            )
          } else if (event.type === 'tool_call') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, toolCalls: [...(m.toolCalls ?? []), { tool: event.tool!, input: event.input ?? {} }] }
                  : m,
              ),
            )
          } else if (event.type === 'tool_result') {
            setMessages(prev =>
              prev.map(m => {
                if (m.id !== assistantId) return m
                const tcs = [...(m.toolCalls ?? [])]
                for (let i = tcs.length - 1; i >= 0; i--) {
                  if (tcs[i].tool === event.tool && tcs[i].result === undefined) {
                    tcs[i] = { ...tcs[i], result: event.result }
                    break
                  }
                }
                return { ...m, toolCalls: tcs }
              }),
            )
          } else if (event.type === 'error') {
            setMessages(prev =>
              prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${event.message}` } : m),
            )
          }
        }
      }
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId ? { ...m, content: `Connection error: ${String(err)}` } : m,
        ),
      )
    } finally {
      setIsStreaming(false)
      setStreamStatus('')
      // Refresh sidebar so new/updated chat appears
      void fetchChats()
    }
  }, [input, isStreaming, messages, fetchChats])

  // ── Auto-execute prompt from URL ──────────────────────────────────────────

  useEffect(() => {
    const prompt = searchParams.get('prompt')
    if (!prompt || autoExecutedRef.current || isStreaming) return
    autoExecutedRef.current = true
    void sendMessage(prompt)
    router.replace('/chat')
  }, [isStreaming, router, searchParams, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: '#0d1323', position: 'relative' }}
    >
      {/* Background */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'url(/bg-overview.jpg)',
            backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.1,
          }}
        />
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(13,19,35,0.6) 0%, rgba(13,19,35,0.2) 40%, rgba(13,19,35,0.7) 100%)',
          }}
        />
      </div>

      {/* ── Agent Picker Modal ────────────────────────────────────────────── */}
      <AgentPickerModal
        open={agentPickerOpen}
        onPick={(agent: Agent) => {
          setAgentId(agent.agentId)
          setAgentPickerOpen(false)
        }}
        onClose={() => setAgentPickerOpen(false)}
      />

      {/* ── Chat History Sidebar ──────────────────────────────────────────── */}
      <aside
        className="w-56 shrink-0 flex flex-col overflow-hidden"
        style={{
          borderRight: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(13,19,35,0.85)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* New Chat button */}
        <div className="p-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={newChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-mono font-medium transition-all duration-150"
            style={{
              background: 'rgba(93,246,224,0.07)',
              border: '1px solid rgba(93,246,224,0.18)',
              color: '#5df6e0',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(93,246,224,0.13)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(93,246,224,0.07)' }}
          >
            <Plus size={13} />
            New Chat
          </button>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {chatsLoading ? (
            <div className="px-3 py-4 text-[10px] font-mono text-center" style={{ color: '#859398' }}>
              Loading...
            </div>
          ) : chats.length === 0 ? (
            <div className="px-3 py-6 text-center space-y-1">
              <div className="text-[11px] font-mono" style={{ color: '#859398' }}>No previous chats</div>
              <div className="text-[10px] font-mono" style={{ color: 'rgba(133,147,152,0.5)' }}>
                Start a conversation to save your history
              </div>
            </div>
          ) : (
            <div className="py-1">
              {chats.map(chat => (
                <ChatHistoryItem
                  key={chat.chatId}
                  chat={chat}
                  isActive={chat.chatId === currentChatId}
                  onClick={() => void loadChat(chat.chatId)}
                  onDelete={(e) => void deleteChat(e, chat.chatId)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main chat area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ position: 'relative', zIndex: 5 }}>
        <TopAppBar breadcrumb={['Hermes', 'Chat', `${AGENT_ICONS[currentAgentId] ?? '✨'} ${currentAgentId}`]} />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 pt-6">
          <div className="max-w-3xl mx-auto pb-4">
            {messages.map(msg =>
              msg.role === 'user' ? (
                <UserBubble key={msg.id} message={msg} />
              ) : (
                <AssistantBubble
                  key={msg.id}
                  message={msg}
                  onPermissionDecision={handlePermissionDecision}
                />
              ),
            )}

            {isStreaming && (() => {
              const last = messages[messages.length - 1]
              return (
                last?.role === 'assistant' &&
                !last.content &&
                (!last.toolCalls || last.toolCalls.length === 0) &&
                (!last.permissions || last.permissions.every(p => p.status !== 'pending'))
              )
            })() && <ThinkingIndicator status={streamStatus || undefined} />}

            {isStreaming && streamStatus === 'Hermes is working...' && (() => {
              const last = messages[messages.length - 1]
              return last?.role === 'assistant' && !!last.content
            })() && (
              <div
                className="flex items-center gap-2 ml-10 mb-3 text-[10px] font-mono"
                style={{ color: '#5df6e0', opacity: 0.6 }}
              >
                <span className="animate-pulse">●</span>
                Hermes is still working...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input bar */}
        <div
          className="shrink-0 px-6 py-4"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(13,19,35,0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          <div className="max-w-3xl mx-auto flex items-end gap-3">
            <div
              className="flex-1 flex items-end gap-2 px-4 py-3 rounded-2xl"
              style={{
                background: 'rgba(47,52,70,0.3)',
                border: '1px solid rgba(255,255,255,0.08)',
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

            <button
              onClick={() => { void sendMessage() }}
              disabled={!input.trim() || isStreaming}
              className="flex items-center justify-center rounded-xl w-10 h-10 shrink-0 active:scale-95 transition-transform"
              style={{
                background: input.trim() && !isStreaming ? 'linear-gradient(135deg, #3cd7ff, #5df6e0)' : 'rgba(60,215,255,0.1)',
                border: '1px solid rgba(60,215,255,0.2)',
                color: input.trim() && !isStreaming ? '#001f27' : 'rgba(60,215,255,0.4)',
                cursor: input.trim() && !isStreaming ? 'pointer' : 'not-allowed',
                boxShadow: input.trim() && !isStreaming ? '0 0 16px rgba(60,215,255,0.3)' : 'none',
                transition: 'background 0.2s, color 0.2s, box-shadow 0.2s',
              }}
            >
              <ArrowUp size={16} />
            </button>
          </div>

          <div
            className="max-w-3xl mx-auto mt-2 text-center text-[10px] font-mono"
            style={{ color: 'rgba(133,147,152,0.4)' }}
          >
            Enter to send · Shift+Enter for newline
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageContent />
    </Suspense>
  )
}
