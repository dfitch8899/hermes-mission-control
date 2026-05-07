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
 * hermesClient.chatSend() currently uses the Slack relay while the direct
 * dashboard chat endpoint is not yet implemented (Phase 3 server-side).
 *
 * Whitelisted prefixes — the route deliberately does NOT expose a raw shell:
 *   /model, /kanban, /profiles, /help, /tasks
 */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { hermesClient } from '@/lib/hermesClient'

const ALLOWED_PREFIXES = [
  '/model', '/kanban', '/profiles', '/help', '/tasks',
  'model ', 'kanban ', 'profiles ', 'tasks ',
]

function isAllowed(command: string): boolean {
  const cmd = command.trim().toLowerCase()
  return ALLOWED_PREFIXES.some(p => cmd.startsWith(p))
}

export async function POST(req: NextRequest) {
  const { command } = await req.json() as { command?: string }
  if (!command?.trim()) {
    return new Response(JSON.stringify({ error: 'command is required' }), { status: 400 })
  }

  if (!isAllowed(command)) {
    return new Response(
      JSON.stringify({ error: 'Command not allowed. Permitted: /kanban, /model, /profiles, /tasks' }),
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
