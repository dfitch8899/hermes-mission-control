import { NextRequest, NextResponse } from 'next/server'
import { cloudwatch, GetMetricStatisticsCommand } from '@/lib/cloudwatch'
import { ecs, DescribeServicesCommand, ECS_CLUSTER, ECS_SERVICE } from '@/lib/ecs'

export async function GET(_req: NextRequest) {
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - 5 * 60 * 1000) // last 5 min

  try {
    const [cpuResult, memResult, serviceResult] = await Promise.allSettled([
      cloudwatch.send(new GetMetricStatisticsCommand({
        Namespace: 'AWS/ECS',
        MetricName: 'CPUUtilization',
        Dimensions: [
          { Name: 'ClusterName', Value: ECS_CLUSTER },
          { Name: 'ServiceName', Value: ECS_SERVICE },
        ],
        StartTime: startTime,
        EndTime: endTime,
        Period: 300,
        Statistics: ['Average'],
      })),
      cloudwatch.send(new GetMetricStatisticsCommand({
        Namespace: 'AWS/ECS',
        MetricName: 'MemoryUtilization',
        Dimensions: [
          { Name: 'ClusterName', Value: ECS_CLUSTER },
          { Name: 'ServiceName', Value: ECS_SERVICE },
        ],
        StartTime: startTime,
        EndTime: endTime,
        Period: 300,
        Statistics: ['Average'],
      })),
      ecs.send(new DescribeServicesCommand({
        cluster: ECS_CLUSTER,
        services: [ECS_SERVICE],
      })),
    ])

    const cpu = cpuResult.status === 'fulfilled'
      ? (cpuResult.value.Datapoints?.[0]?.Average ?? null)
      : null

    const memory = memResult.status === 'fulfilled'
      ? (memResult.value.Datapoints?.[0]?.Average ?? null)
      : null

    const service = serviceResult.status === 'fulfilled'
      ? serviceResult.value.services?.[0]
      : null

    const taskCount = service?.runningCount ?? null
    const deployedAt = service?.deployments?.[0]?.createdAt
    const uptime = deployedAt ? Date.now() - new Date(deployedAt).getTime() : null

    return NextResponse.json({ cpu, memory, taskCount, uptime })
  } catch (err) {
    console.error('[api/ecs/metrics GET]', err)
    // Return mock metrics
    return NextResponse.json({
      cpu: 42.8,
      memory: 61.3,
      taskCount: 1,
      uptime: 86400000 * 3 + 3600000 * 7,
      _mock: true,
    })
  }
}
