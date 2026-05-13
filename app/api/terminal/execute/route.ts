/**
 * POST /api/terminal/execute
 *
 * Body: { command: string }
 *
 * Routes the command to Hermes via the appropriate transport:
 *
 *   CLI_COMMANDS (match mc_proxy EXEC_WHITELIST)
 *     → hermesClient.exec()  — runs `hermes <cmd>` as a subprocess on ECS.
 *       Returns full text output in one shot.
 *
 *   Everything else (session slash commands: /usage, /new, /stop, /title, …)
 *     → hermesClient.chatSend() — sends to the api_server, streams the reply.
 *
 * Both paths emit the same SSE envelope:
 *   { type: 'status',       message: string }
 *   { type: 'text_replace', text: string }    — accumulated reply text
 *   { type: 'done' }
 *   { type: 'error',        message: string }
 */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hermesClient } from '@/lib/hermesClient'

// ── Routing ──────────────────────────────────────────────────────────────────
//
// CLI_COMMANDS mirrors mc_proxy's EXEC_WHITELIST exactly.
// These run as `hermes <cmd>` subprocess → exec path.
//
// Every other allowed command is a session slash command and is sent to
// the api_server via chatSend so Hermes processes it in agent context.

// These run as `hermes <cmd>` subprocess — confirmed non-interactive via live testing.
// Commands that require a TTY (tools, plugins, gateway, chat, doctor, acp) are
// intentionally excluded so they fall through to the chatSend path.
const CLI_COMMANDS = new Set([
  'model', 'setup', 'auth', 'status', 'cron',
  'webhook', 'config', 'pairing', 'skills',
  'memory', 'mcp', 'sessions', 'insights', 'claw',
  'version', 'profile', 'completion', 'logs',
])

// Full set of commands this endpoint accepts (union of CLI + session commands).
const HERMES_COMMANDS = new Set([
  ...Array.from(CLI_COMMANDS),
  // Hermes CLI extras
  'whatsapp', 'login', 'logout', 'update', 'uninstall',
  // Session-management slash commands
  'new', 'reset', 'clear', 'stop', 'history', 'save', 'retry', 'undo',
  'title', 'compress', 'rollback', 'snapshot', 'snap', 'branch', 'fork', 'resume', 'redraw',
  // Queue / steering
  'background', 'bg', 'btw', 'queue', 'q', 'steer', 'goal',
  // Configuration aliases
  'personality', 'verbose', 'fast', 'reasoning', 'skin', 'voice',
  'yolo', 'footer', 'busy', 'indicator', 'statusbar', 'sb',
  // Tools & skills aliases
  'toolsets', 'browser', 'curator', 'reload-mcp', 'reload_mcp', 'reload',
  // Information aliases
  'help', 'usage', 'platforms', 'debug', 'gquota', 'copy', 'paste', 'image',
  // Kanban / tasks / profiles
  'kanban', 'tasks', 'profiles',
  // Messaging-platform-only
  'approve', 'deny', 'sethome', 'restart', 'commands',
  // Exit aliases
  'quit', 'exit',
])

function parseBase(command: string): string {
  return command.trim().replace(/^\//, '').split(/\s+/)[0].toLowerCase()
}

function isAllowed(command: string): boolean {
  return HERMES_COMMANDS.has(parseBase(command))
}

function usesCli(command: string): boolean {
  return CLI_COMMANDS.has(parseBase(command))
}

export async function POST(req: NextRequest) {
  const { command } = await req.json() as { command?: string }
  if (!command?.trim()) {
    return new Response(JSON.stringify({ error: 'command is required' }), { status: 400 })
  }

  if (!isAllowed(command)) {
    return new Response(
      JSON.stringify({ error: `Command not allowed: "${parseBase(command)}". Type /help for available commands.` }),
      { status: 400 },
    )
  }

  const session    = await getServerSession(authOptions)
  const senderName = session?.user?.name ?? session?.user?.email ?? 'Terminal'

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
        send({ type: 'status', message: 'Connecting to Hermes...' })

        if (usesCli(command)) {
          // ── CLI subprocess path ──────────────────────────────────────────
          const output = await hermesClient.exec(command, senderName)
          const reply  = (output ?? '').trim()
          send({ type: 'text_replace', text: reply || '(no output — command ran silently)' })
          send({ type: 'done' })
        } else {
          // ── Session slash command — api_server chat path ─────────────────
          // Ensure the command has a leading / so Hermes recognises it as a
          // slash command rather than a plain chat message.
          const slashCmd = command.trim().startsWith('/') ? command.trim() : `/${command.trim()}`

          let hasUpdate = false
          const reply = await hermesClient.chatSend({
            text:      slashCmd,
            senderName,
            agentId:   'general',
            onPermissionRequest: () => { /* terminal ignores permission prompts */ },
            onTextUpdate: (text) => {
              hasUpdate = true
              send({ type: 'text_replace', text })
            },
          })

          if (!hasUpdate) {
            send({ type: 'text_replace', text: reply ?? '(no output — command ran silently)' })
          }
          send({ type: 'done' })
        }
      } catch (err) {
        send({ type: 'error', message: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
