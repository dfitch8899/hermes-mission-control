/**
 * POST /api/terminal/execute
 *
 * Body: { command: string }
 *
 * Sends a command to Hermes via hermesClient.chatSend() and streams the reply
 * back as SSE events (same shape as /api/chat):
 *
 *   { type: 'status',       message: string }
 *   { type: 'text_replace', text: string }    — accumulated reply text
 *   { type: 'done' }
 *   { type: 'error',        message: string }
 *
 * Allowed commands:
 *   - Any Hermes slash command (/new, /status, /model, /kanban, /usage, etc.)
 *   - Bare-word equivalents without the leading slash
 *
 * This endpoint does NOT expose a raw shell — it only sends chat messages to
 * the Hermes agent, which interprets them as slash commands.
 */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hermesClient } from '@/lib/hermesClient'

// Complete set of Hermes CLI slash commands (from docs/reference/slash-commands).
// Any command whose base matches this set is allowed, with or without the leading /.
const HERMES_COMMANDS = new Set([
  // Session management
  'new', 'reset', 'clear', 'stop', 'status', 'history', 'save', 'retry', 'undo',
  'title', 'compress', 'rollback', 'snapshot', 'snap', 'branch', 'fork', 'resume', 'redraw',
  // Queue / steering
  'background', 'bg', 'btw', 'queue', 'q', 'steer', 'goal',
  // Configuration
  'config', 'model', 'personality', 'verbose', 'fast', 'reasoning', 'skin', 'voice',
  'yolo', 'footer', 'busy', 'indicator', 'statusbar', 'sb',
  // Tools & skills
  'tools', 'toolsets', 'browser', 'skills', 'cron', 'curator',
  'reload-mcp', 'reload_mcp', 'reload', 'plugins',
  // Information
  'help', 'usage', 'insights', 'platforms', 'gateway', 'debug', 'profile',
  'gquota', 'copy', 'paste', 'image',
  // Kanban / tasks / profiles
  'kanban', 'tasks', 'profiles',
  // Messaging-platform-only (allowed so terminal mirrors full Hermes surface)
  'approve', 'deny', 'sethome', 'update', 'restart', 'commands',
  // Exit aliases
  'quit', 'exit',
])

function isAllowed(command: string): boolean {
  const cmd = command.trim().toLowerCase()
  // Strip leading slash (if any) and grab the first word
  const base = cmd.replace(/^\//, '').split(/\s+/)[0]
  return HERMES_COMMANDS.has(base)
}

export async function POST(req: NextRequest) {
  const { command } = await req.json() as { command?: string }
  if (!command?.trim()) {
    return new Response(JSON.stringify({ error: 'command is required' }), { status: 400 })
  }

  if (!isAllowed(command)) {
    return new Response(
      JSON.stringify({ error: `Command not allowed: "${command.trim().split(/\s+/)[0]}". Type /help for available commands.` }),
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
        send({ type: 'status', message: 'Sending to Hermes...' })

        const reply = await hermesClient.chatSend({
          text:      command,
          senderName,
          agentId:   'terminal',
          onPermissionRequest: () => { /* not shown in terminal */ },
          onTextUpdate: (text) => {
            send({ type: 'text_replace', text })
          },
        })

        if (!reply) {
          send({ type: 'text_replace', text: '(no response — Hermes may still be processing)' })
        }

        send({ type: 'done' })
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
