import { NextRequest, NextResponse } from 'next/server'
import { cwLogs, GetLogEventsCommand, getLatestLogStream } from '@/lib/cloudwatch'
import { MOCK_ECS_LOGS } from '@/lib/mockData'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lines = parseInt(searchParams.get('lines') || '50')
  const logGroupName = process.env.CLOUDWATCH_LOG_GROUP || '/ecs/hermes-agent'

  try {
    const streamName = await getLatestLogStream(logGroupName)

    if (!streamName) {
      throw new Error('No log stream found')
    }

    const cmd = new GetLogEventsCommand({
      logGroupName,
      logStreamName: streamName,
      limit: lines,
      startFromHead: false,
    })

    const result = await cwLogs.send(cmd)
    const logs = (result.events || []).map(e => ({
      timestamp: e.timestamp ?? Date.now(),
      message: e.message ?? '',
    }))

    return NextResponse.json({ logs, streamName })
  } catch (err) {
    console.error('[api/ecs/logs GET]', err)
    // Return mock logs as fallback
    const mockLogs = MOCK_ECS_LOGS.slice(-lines)
    return NextResponse.json({ logs: mockLogs, _mock: true })
  }
}
