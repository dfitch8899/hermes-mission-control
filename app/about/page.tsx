import TopAppBar from '@/components/layout/TopAppBar'
import Badge from '@/components/ui/Badge'
import {
  Home,
  MessageSquare,
  Bot,
  Kanban,
  Brain,
  Calendar,
  Terminal,
  Sparkles,
  Compass,
  Zap,
  Keyboard,
} from 'lucide-react'

export const metadata = {
  title: 'About — Hermes Mission Control',
  description:
    'Overview of Hermes and Mission Control, feature guide, and a reference of useful terminal and chat commands.',
}

interface Feature {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  accent: { color: string; soft: string; glow: string }
  blurb: string
}

const CYAN = { color: '#3cd7ff', soft: '#a8e8ff', glow: 'rgba(60, 215, 255, 0.2)' }
const TEAL = { color: '#5df6e0', soft: '#5df6e0', glow: 'rgba(93, 246, 224, 0.2)' }
const PURPLE = { color: '#b8c4ff', soft: '#b8c4ff', glow: 'rgba(184, 196, 255, 0.2)' }

const FEATURES: Feature[] = [
  {
    href: '/',
    label: 'Overview',
    icon: Home,
    accent: CYAN,
    blurb:
      'Real-time pulse of the agent: active tasks, memory utilisation, uptime and the next scheduled event. Your default landing pad.',
  },
  {
    href: '/chat',
    label: 'Chat',
    icon: MessageSquare,
    accent: TEAL,
    blurb:
      'Free-form streaming conversation with Hermes. Ask questions, give instructions, watch tool calls run live. Press Enter to send, Shift+Enter for a newline.',
  },
  {
    href: '/agents',
    label: 'Agents',
    icon: Bot,
    accent: PURPLE,
    blurb:
      'Manage agent profiles — custom names, colours and icons — and see which tasks each agent is assigned to. Mix built-ins with your own.',
  },
  {
    href: '/kanban',
    label: 'Kanban',
    icon: Kanban,
    accent: CYAN,
    blurb:
      'Task board for Hermes jobs with Backlog → Running → Done columns. Filter by agent, dispatch a task, and click into Chat with full task context preloaded.',
  },
  {
    href: '/memory',
    label: 'Memory',
    icon: Brain,
    accent: TEAL,
    blurb:
      'Searchable knowledge base of facts Hermes has retained across conversations. Watch sync status, import or export, prune what you no longer need.',
  },
  {
    href: '/calendar',
    label: 'Calendar',
    icon: Calendar,
    accent: PURPLE,
    blurb:
      'Schedule cron jobs and planned events. Each entry shows a live countdown to its next run so you always know what is about to fire.',
  },
  {
    href: '/terminal',
    label: 'Terminal',
    icon: Terminal,
    accent: CYAN,
    blurb:
      'Command-line interface for direct Hermes interaction. Run local commands like ping or kanban, or forward any /command straight to the agent.',
  },
]

interface CommandRow {
  cmd: string
  desc: string
}

const LOCAL_COMMANDS: CommandRow[] = [
  { cmd: 'help', desc: 'Print every command the terminal recognises.' },
  { cmd: 'clear', desc: 'Clear the terminal output buffer.' },
  { cmd: 'ping', desc: 'Test connectivity to Hermes; reports transport and providers.' },
  { cmd: 'model', desc: 'Show the active model. model list / model <name> to switch.' },
  { cmd: 'kanban list', desc: 'List tasks. Add --status=running / done / backlog to filter.' },
  { cmd: 'kanban add <title>', desc: 'Create a new task on the board.' },
  { cmd: 'kanban done <id>', desc: 'Mark a task complete. Also: block, unblock, assign, comment.' },
  { cmd: 'kanban dispatch', desc: 'Push pending tasks to Hermes for execution.' },
  { cmd: 'tasks', desc: 'Alias for kanban.' },
  { cmd: 'memory list', desc: 'List stored memories. memory search <query> to search.' },
  { cmd: 'memory add', desc: 'Interactive prompt to store a new memory.' },
  { cmd: 'ecs status', desc: 'Inspect the Hermes ECS service. Also: ecs logs [n], ecs tasks.' },
  { cmd: 'calendar list', desc: 'List upcoming scheduled events.' },
  { cmd: 'sync', desc: 'Pull the latest Hermes state into Mission Control.' },
  { cmd: 'exit', desc: 'Close the terminal UI. quit also works.' },
]

const FORWARDED_COMMANDS: CommandRow[] = [
  { cmd: '/status', desc: 'Where is Hermes right now? Active session, queue, model.' },
  { cmd: '/new', desc: 'Start a fresh conversation thread.' },
  { cmd: '/reset', desc: 'Reset the current session.' },
  { cmd: '/history', desc: 'Show recent conversation turns.' },
  { cmd: '/usage', desc: 'Token and request usage for the session.' },
  { cmd: '/tools', desc: 'List the tools currently exposed to Hermes.' },
  { cmd: '/skills', desc: 'List installed skills.' },
  { cmd: '/cron', desc: 'View or edit Hermes cron jobs.' },
]

const CHAT_TIPS = [
  'Chat is free-form natural language — no slash commands needed.',
  'Press Enter to send. Shift+Enter inserts a newline.',
  'Opening a Kanban card jumps you into Chat with the task already loaded.',
  'Useful prompts: "what is running right now?", "summarise today’s tasks", "schedule a daily report at 9am", "show me memories about X".',
]

interface SectionHeadingProps {
  eyebrow: string
  title: React.ReactNode
  subtitle?: string
}

function SectionHeading({ eyebrow, title, subtitle }: SectionHeadingProps) {
  return (
    <div className="space-y-1">
      <div
        className="text-[10px] font-mono uppercase tracking-[0.25em]"
        style={{ color: '#5df6e0' }}
      >
        {eyebrow}
      </div>
      <h2 className="font-headline text-xl font-semibold tracking-tight">{title}</h2>
      {subtitle && (
        <p className="text-[13px] text-outline max-w-2xl">{subtitle}</p>
      )}
    </div>
  )
}

export default function AboutPage() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Ambient background gradient — matches Overview atmosphere */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 1000px 600px at 20% 10%, rgba(60,215,255,0.05), transparent), radial-gradient(ellipse 800px 500px at 90% 80%, rgba(93,246,224,0.04), transparent)',
          zIndex: 0,
        }}
      />

      <TopAppBar breadcrumb={['Hermes', 'About']} />

      <div className="flex-1 overflow-y-auto relative z-10">
        <div className="p-6 space-y-8 max-w-6xl mx-auto">
          {/* ─── Hero ─── */}
          <section
            className="rounded-2xl p-8 relative overflow-hidden glass-card-glow animate-fade-in-up stagger-1"
            style={{ borderTop: '2px solid #3cd7ff' }}
          >
            {/* Corner accent orb */}
            <div
              className="absolute -top-16 -right-16 w-64 h-64 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle, rgba(60,215,255,0.12) 0%, transparent 70%)',
              }}
            />
            <div
              className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle, rgba(93,246,224,0.08) 0%, transparent 70%)',
              }}
            />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="cyan">Hermes Console</Badge>
                <Badge variant="teal">v1</Badge>
                <Badge variant="muted">Operations Dashboard</Badge>
              </div>

              <h1 className="font-headline text-4xl md:text-5xl font-bold tracking-tight leading-tight">
                Mission{' '}
                <span className="text-glow-cyan" style={{ color: '#3cd7ff' }}>
                  Control
                </span>
              </h1>

              <p className="text-[15px] text-on-background max-w-2xl leading-relaxed">
                The flight deck for{' '}
                <span style={{ color: '#5df6e0' }}>Hermes</span> — an
                autonomous agent that runs scheduled jobs, holds long-running
                conversations, remembers what matters and orchestrates work
                across tools. This page is your orientation: what each surface
                is for, and which commands do what.
              </p>
            </div>
          </section>

          {/* ─── What is this? ─── */}
          <section className="space-y-4 animate-fade-in-up stagger-2">
            <SectionHeading
              eyebrow="01 — Foundations"
              title="What you are looking at"
              subtitle="Two pieces working together: the agent that does the work, and the console you use to direct it."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <article
                className="glass-card rounded-2xl p-6 relative overflow-hidden"
                style={{ borderTop: '2px solid #3cd7ff' }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: 'rgba(60,215,255,0.12)',
                      border: '1px solid rgba(60,215,255,0.25)',
                      color: '#3cd7ff',
                    }}
                  >
                    <Sparkles size={18} />
                  </div>
                  <h3 className="font-headline text-lg font-semibold">
                    Hermes
                  </h3>
                </div>
                <p className="text-[13.5px] leading-relaxed text-on-background opacity-90">
                  Hermes is the autonomous agent running behind the scenes. It
                  takes instructions, dispatches tasks, runs on a schedule,
                  switches between models and remembers what you have told it
                  before. Think of it as the worker.
                </p>
              </article>

              <article
                className="glass-card rounded-2xl p-6 relative overflow-hidden"
                style={{ borderTop: '2px solid #5df6e0' }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: 'rgba(93,246,224,0.12)',
                      border: '1px solid rgba(93,246,224,0.25)',
                      color: '#5df6e0',
                    }}
                  >
                    <Compass size={18} />
                  </div>
                  <h3 className="font-headline text-lg font-semibold">
                    Mission Control
                  </h3>
                </div>
                <p className="text-[13.5px] leading-relaxed text-on-background opacity-90">
                  This app — the dashboard you steer Hermes with. You can chat
                  with the agent, queue tasks on a Kanban board, browse its
                  memory, schedule jobs and drop into a terminal for direct
                  control. Think of it as the cockpit.
                </p>
              </article>
            </div>
          </section>

          {/* ─── Feature guide ─── */}
          <section className="space-y-4 animate-fade-in-up stagger-3">
            <SectionHeading
              eyebrow="02 — Feature guide"
              title="What every surface is for"
              subtitle="Each entry in the left sidebar opens one of these. Icons here match the sidebar one-to-one."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map((f, i) => {
                const Icon = f.icon
                return (
                  <a
                    key={f.href}
                    href={f.href}
                    className={`glass-card rounded-2xl p-5 relative overflow-hidden block animate-fade-in-up stagger-${Math.min(i + 1, 7)}`}
                  >
                    {/* Corner orb */}
                    <div
                      className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
                      style={{
                        background: `radial-gradient(circle, ${f.accent.glow} 0%, transparent 70%)`,
                      }}
                    />

                    <div className="relative z-10 space-y-3">
                      <div className="flex items-center justify-between">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{
                            background: `${f.accent.color}1f`,
                            border: `1px solid ${f.accent.color}40`,
                            color: f.accent.color,
                          }}
                        >
                          <Icon size={18} />
                        </div>
                        <span
                          className="text-[9px] font-mono uppercase tracking-[0.2em] text-outline"
                        >
                          {f.href}
                        </span>
                      </div>

                      <h3
                        className="font-headline text-base font-semibold tracking-tight"
                        style={{ color: f.accent.soft }}
                      >
                        {f.label}
                      </h3>

                      <p className="text-[12.5px] leading-relaxed text-on-background opacity-80">
                        {f.blurb}
                      </p>
                    </div>
                  </a>
                )
              })}
            </div>
          </section>

          {/* ─── Terminal commands ─── */}
          <section className="space-y-4 animate-fade-in-up stagger-4">
            <SectionHeading
              eyebrow="03 — Reference"
              title="Useful terminal commands"
              subtitle="Run these from /terminal. Anything starting with / is forwarded straight to the agent."
            />

            <div
              className="rounded-2xl p-6 relative overflow-hidden glass-card-glow"
              style={{ borderTop: '2px solid #3cd7ff' }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-6 relative z-10">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Terminal size={14} style={{ color: '#3cd7ff' }} />
                    <h4 className="text-[11px] font-mono uppercase tracking-[0.2em]" style={{ color: '#3cd7ff' }}>
                      Local commands
                    </h4>
                  </div>
                  <ul className="space-y-2.5">
                    {LOCAL_COMMANDS.map((c) => (
                      <li
                        key={c.cmd}
                        className="grid grid-cols-[minmax(0,11rem)_1fr] gap-3 items-baseline"
                      >
                        <code
                          className="font-mono text-[11.5px] px-2 py-0.5 rounded-md whitespace-nowrap overflow-hidden text-ellipsis"
                          style={{
                            background: 'rgba(60,215,255,0.08)',
                            border: '1px solid rgba(60,215,255,0.18)',
                            color: '#a8e8ff',
                          }}
                        >
                          {c.cmd}
                        </code>
                        <span className="text-[12.5px] text-on-background opacity-80 leading-snug">
                          {c.desc}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap size={14} style={{ color: '#5df6e0' }} />
                    <h4 className="text-[11px] font-mono uppercase tracking-[0.2em]" style={{ color: '#5df6e0' }}>
                      Forwarded to Hermes
                    </h4>
                  </div>
                  <ul className="space-y-2.5">
                    {FORWARDED_COMMANDS.map((c) => (
                      <li
                        key={c.cmd}
                        className="grid grid-cols-[minmax(0,11rem)_1fr] gap-3 items-baseline"
                      >
                        <code
                          className="font-mono text-[11.5px] px-2 py-0.5 rounded-md whitespace-nowrap overflow-hidden text-ellipsis"
                          style={{
                            background: 'rgba(93,246,224,0.08)',
                            border: '1px solid rgba(93,246,224,0.18)',
                            color: '#5df6e0',
                          }}
                        >
                          {c.cmd}
                        </code>
                        <span className="text-[12.5px] text-on-background opacity-80 leading-snug">
                          {c.desc}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-outline pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    Any <code className="font-mono" style={{ color: '#5df6e0' }}>/command</code> not handled locally is forwarded to Hermes. Bare-word forms (e.g. <code className="font-mono" style={{ color: '#5df6e0' }}>status</code>) also work.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ─── Chat tips ─── */}
          <section className="space-y-4 animate-fade-in-up stagger-5">
            <SectionHeading
              eyebrow="04 — Tips"
              title="Talking to Hermes in Chat"
              subtitle="Chat is conversational. There are no slash commands — just say what you want."
            />

            <div
              className="glass-card rounded-2xl p-6 relative overflow-hidden"
              style={{ borderTop: '2px solid #b8c4ff' }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: 'rgba(184,196,255,0.12)',
                    border: '1px solid rgba(184,196,255,0.25)',
                    color: '#b8c4ff',
                  }}
                >
                  <Keyboard size={18} />
                </div>
                <ul className="space-y-2.5 flex-1">
                  {CHAT_TIPS.map((tip, i) => (
                    <li
                      key={i}
                      className="text-[13px] leading-relaxed text-on-background opacity-90 flex gap-3"
                    >
                      <span style={{ color: '#b8c4ff' }} aria-hidden>
                        ◆
                      </span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* ─── Footer ─── */}
          <footer className="pt-2 pb-6">
            <div
              className="text-[10px] font-mono uppercase tracking-[0.2em] text-outline text-center"
            >
              Hermes Mission Control · Built on Next.js · Tailwind · Hermes Agent
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
