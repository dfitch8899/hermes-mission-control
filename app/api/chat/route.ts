import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are Hermes, an AI agent mission control assistant. You help manage tasks, memories, and scheduled jobs. When the user asks you to do something, use your tools to make it happen. Be concise and confirm what you did.`

const tools: Anthropic.Tool[] = [
  {
    name: 'create_task',
    description: 'Create a new task in the mission control system',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Task priority' },
        assignee: { type: 'string', description: 'Assignee (e.g. "human", "hermes", or a name)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List tasks from the mission control system, optionally filtered by status',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['queued', 'in_progress', 'done', 'blocked'], description: 'Filter by status' },
      },
      required: [],
    },
  },
  {
    name: 'create_memory',
    description: 'Store a new memory or piece of information in the system',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Memory title' },
        content: { type: 'string', description: 'Memory content' },
        type: { type: 'string', enum: ['context', 'decision', 'insight', 'reference'], description: 'Memory type' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'list_memories',
    description: 'List stored memories from the system',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
]

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'create_task': {
      const res = await fetch(`${BASE_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      return res.json()
    }
    case 'list_tasks': {
      const url = new URL(`${BASE_URL}/api/tasks`)
      if (input.status) url.searchParams.set('status', input.status as string)
      const res = await fetch(url.toString())
      return res.json()
    }
    case 'create_memory': {
      const res = await fetch(`${BASE_URL}/api/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      return res.json()
    }
    case 'list_memories': {
      const res = await fetch(`${BASE_URL}/api/memories`)
      return res.json()
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const conversationMessages: Anthropic.MessageParam[] = messages

        // Agentic loop — keep going while Claude wants to use tools
        while (true) {
          const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools,
            messages: conversationMessages,
          })

          // Collect tool uses and text from this response
          const toolUses: Anthropic.ToolUseBlock[] = []
          const textBlocks: string[] = []

          for (const block of response.content) {
            if (block.type === 'text') {
              textBlocks.push(block.text)
            } else if (block.type === 'tool_use') {
              toolUses.push(block)
            }
          }

          if (toolUses.length > 0) {
            // Execute all tool uses and stream tool_call events to the client
            const toolResults: Anthropic.ToolResultBlockParam[] = []

            for (const toolUse of toolUses) {
              // Signal tool call to client
              const toolCallEvent = JSON.stringify({
                type: 'tool_call',
                tool: toolUse.name,
                input: toolUse.input,
              })
              controller.enqueue(encoder.encode(`data: ${toolCallEvent}\n\n`))

              const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>)

              // Signal tool result to client
              const toolResultEvent = JSON.stringify({
                type: 'tool_result',
                tool: toolUse.name,
                result,
              })
              controller.enqueue(encoder.encode(`data: ${toolResultEvent}\n\n`))

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(result),
              })
            }

            // Add assistant turn + tool results to conversation and continue
            conversationMessages.push({ role: 'assistant', content: response.content })
            conversationMessages.push({ role: 'user', content: toolResults })

            if (response.stop_reason === 'end_turn' && toolUses.length === 0) {
              break
            }
            // Continue loop to get final text response
            continue
          }

          // No tool uses — stream the text response character by character
          const finalText = textBlocks.join('')
          for (const char of finalText) {
            const textEvent = JSON.stringify({ type: 'text', delta: char })
            controller.enqueue(encoder.encode(`data: ${textEvent}\n\n`))
          }

          // Signal done
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
          break
        }
      } catch (err) {
        const errorEvent = JSON.stringify({ type: 'error', message: String(err) })
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
