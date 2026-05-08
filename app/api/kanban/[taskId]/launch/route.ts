import { NextRequest, NextResponse } from 'next/server'
import { getRequestActorName } from '@/lib/request-actor'
import { hermesKanban } from '@/lib/hermes-kanban'
import type { KanbanComment, KanbanTask } from '@/types/kanban'

function formatTaskPrompt(task: KanbanTask, comments: KanbanComment[]) {
  const recentComments = comments
    .slice(-3)
    .map((comment) => `- ${comment.author} @ ${comment.ts}: ${comment.body.trim()}`)

  return [
    'You are helping from Mission Control in a manual chat session linked to a kanban task.',
    'This is not a native Hermes kanban worker run, so do not assume kanban lifecycle tools are available in this chat.',
    'Do not claim the task is complete just because the chat launched. If you truly finish it, summarize the concrete artifacts, tests, and follow-ups so the operator can update the task explicitly from Mission Control.',
    '',
    `Board: ${task.boardSlug ?? 'default'}`,
    `Task ID: ${task.taskId}`,
    `Status: ${task.status}`,
    `Assignee: ${task.assignee || 'unassigned'}`,
    `Priority: ${task.priority}`,
    task.tenant ? `Tenant: ${task.tenant}` : null,
    task.workspaceType ? `Workspace: ${task.workspaceType}${task.workspacePath ? ` (${task.workspacePath})` : ''}` : null,
    task.tags?.length ? `Tags: ${task.tags.join(', ')}` : null,
    task.skills?.length ? `Skills: ${task.skills.join(', ')}` : null,
    task.parentIds.length ? `Parent tasks: ${task.parentIds.join(', ')}` : null,
    task.childIds.length ? `Child tasks: ${task.childIds.join(', ')}` : null,
    task.blockedReason ? `Blocked reason: ${task.blockedReason}` : null,
    task.resultSummary ? `Latest result summary: ${task.resultSummary}` : null,
    task.latestHandoff ? `Latest handoff: ${task.latestHandoff.from} → ${task.latestHandoff.to} @ ${task.latestHandoff.ts}${task.latestHandoff.note ? ` — ${task.latestHandoff.note}` : ''}` : null,
    '',
    `Title: ${task.title}`,
    task.body ? `Description:\n${task.body}` : 'Description: —',
    recentComments.length ? `\nRecent comments:\n${recentComments.join('\n')}` : null,
  ].filter(Boolean).join('\n')
}

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const board = new URL(req.url).searchParams.get('board') ?? 'default'

  try {
    const detail = await hermesKanban.getTask(params.taskId, { board })
    const task = detail.task

    if (task.archivedAt || task.status === 'done' || task.status === 'archived') {
      return NextResponse.json({ error: 'Finished tasks cannot be launched into chat.' }, { status: 409 })
    }

    const senderName = await getRequestActorName('Mission Control')
    const launchMode = hermesKanban.lastBackendUsed === 'native' ? 'dispatch' : 'manual-chat'

    if (launchMode === 'dispatch') {
      const result = await hermesKanban.dispatchTask(params.taskId, { board })
      return NextResponse.json({
        ok: true,
        launchMode,
        board,
        task: result.task,
      })
    }

    await hermesKanban.addComment(
      params.taskId,
      `Mission Control opened a manual Hermes chat for this task. Status remains ${task.status} until someone explicitly updates the task lifecycle.`,
      senderName,
      board,
    ).catch(() => {})

    return NextResponse.json({
      ok: true,
      launchMode,
      board,
      agentId: task.assignee || 'general',
      prompt: formatTaskPrompt(task, detail.comments ?? []),
      task,
    })
  } catch (err) {
    console.error(`[api/kanban/${params.taskId}/launch POST]`, err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('finished') ? 409
      : message.includes('already running') ? 409
        : message.includes('assign') ? 409
          : message.includes('triage') ? 409
            : message.includes('not found') ? 404
              : 500
    return NextResponse.json({ error: message }, { status })
  }
}
