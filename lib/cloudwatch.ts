import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch'
import { CloudWatchLogsClient, GetLogEventsCommand, DescribeLogStreamsCommand } from '@aws-sdk/client-cloudwatch-logs'

export const cloudwatch = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-2' })
export const cwLogs = new CloudWatchLogsClient({ region: process.env.AWS_REGION || 'us-east-2' })

export { GetMetricStatisticsCommand, GetLogEventsCommand, DescribeLogStreamsCommand }

export async function getLatestLogStream(logGroupName: string): Promise<string | null> {
  try {
    const cmd = new DescribeLogStreamsCommand({
      logGroupName,
      orderBy: 'LastEventTime',
      descending: true,
      limit: 1,
    })
    const result = await cwLogs.send(cmd)
    return result.logStreams?.[0]?.logStreamName ?? null
  } catch {
    return null
  }
}
