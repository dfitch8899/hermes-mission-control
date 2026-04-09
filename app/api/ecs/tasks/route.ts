import { NextRequest, NextResponse } from 'next/server'
import { ecs, ListTasksCommand, DescribeTasksCommand, ECS_CLUSTER } from '@/lib/ecs'
import type { EcsTask } from '@/types/ecs'

export async function GET(_req: NextRequest) {
  try {
    const listResult = await ecs.send(new ListTasksCommand({
      cluster: ECS_CLUSTER,
      desiredStatus: 'RUNNING',
    }))

    const taskArns = listResult.taskArns || []

    if (taskArns.length === 0) {
      return NextResponse.json({ tasks: [] })
    }

    const describeResult = await ecs.send(new DescribeTasksCommand({
      cluster: ECS_CLUSTER,
      tasks: taskArns,
    }))

    const tasks: EcsTask[] = (describeResult.tasks || []).map(t => ({
      taskArn: t.taskArn || '',
      taskDefinitionArn: t.taskDefinitionArn || '',
      lastStatus: t.lastStatus || '',
      desiredStatus: t.desiredStatus || '',
      cpu: t.cpu || '0',
      memory: t.memory || '0',
      startedAt: t.startedAt,
      group: t.group,
    }))

    return NextResponse.json({ tasks })
  } catch (err) {
    console.error('[api/ecs/tasks GET]', err)
    // Return mock task
    return NextResponse.json({
      tasks: [
        {
          taskArn: `arn:aws:ecs:us-east-2:123456789:task/${ECS_CLUSTER}/mock-task-id`,
          taskDefinitionArn: 'arn:aws:ecs:us-east-2:123456789:task-definition/hermes-agent:12',
          lastStatus: 'RUNNING',
          desiredStatus: 'RUNNING',
          cpu: '512',
          memory: '1024',
          startedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
          group: 'service:hermes-agent',
        },
      ],
      _mock: true,
    })
  }
}
