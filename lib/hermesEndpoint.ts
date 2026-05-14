/**
 * hermesEndpoint.ts — Dynamic discovery of the Hermes dashboard URL.
 *
 * Hermes runs in an ECS Fargate task with a new public IP on each restart.
 * This module auto-discovers the current task's public IP via the ECS + EC2 APIs
 * and caches it for 30 minutes (invalidated proactively on 5xx / network errors).
 *
 * No manual port-forwarding needed — the MC connects directly to mc_proxy
 * on the task's public IP (port 9120).  hermesEndpoint.ts resolves that IP
 * automatically on first use and caches it.
 *
 * Override: if HERMES_DASHBOARD_URL is set to a non-localhost address it is
 * used directly (useful for testing against a stable proxy or a fixed IP).
 *
 * Returns e.g. "http://13.59.148.206:9120"
 */

import { ECSClient, ListTasksCommand, DescribeTasksCommand } from '@aws-sdk/client-ecs'
import {
  EC2Client,
  DescribeNetworkInterfacesCommand,
} from '@aws-sdk/client-ec2'

const CLUSTER    = process.env.HERMES_ECS_CLUSTER  ?? 'hermes-agent'
const SERVICE    = process.env.HERMES_ECS_SERVICE   ?? 'hermes-agent'
const PROXY_PORT = process.env.HERMES_PROXY_PORT    ?? '9120'
const REGION     = process.env.AWS_DEFAULT_REGION   ?? 'us-east-2'

/** Static override — used as-is when non-localhost. */
const STATIC_URL = process.env.HERMES_DASHBOARD_URL

interface CacheEntry { url: string; expiresAt: number }

/**
 * Persist the cache on `globalThis` instead of a module-level binding so it
 * survives Next.js dev hot-reloads. Module-level state gets reset every time
 * webpack re-imports the file (which happens often during HMR), forcing every
 * request to redo three AWS API calls — ~1.5s of overhead per request, and
 * 7+ "Discovered Hermes at …" log lines per minute during normal browsing.
 *
 * This is the standard Next.js dev pattern for any caches that should
 * outlive HMR. In production builds it's effectively a regular module
 * variable since HMR isn't running.
 */
const CACHE_KEY = '__hermesEndpointCache__'
type CacheGlobal = typeof globalThis & { [CACHE_KEY]?: CacheEntry | null }
const _g = globalThis as CacheGlobal

function _readCache(): CacheEntry | null { return _g[CACHE_KEY] ?? null }
function _writeCache(v: CacheEntry | null): void { _g[CACHE_KEY] = v }

/**
 * Returns the base URL for the Hermes dashboard/proxy.
 *
 * Priority:
 *  1. HERMES_DASHBOARD_URL env var, if set to a non-localhost address.
 *  2. Cached ECS discovery result (TTL: 5 min, HMR-resilient).
 *  3. Fresh ECS → EC2 discovery.
 */
export async function getHermesDashboardUrl(): Promise<string> {
  // Non-localhost static override → use it directly (dev proxy, fixed IP, etc.)
  if (
    STATIC_URL &&
    !STATIC_URL.includes('127.0.0.1') &&
    !STATIC_URL.includes('localhost')
  ) {
    return STATIC_URL.replace(/\/$/, '')
  }

  const now = Date.now()
  const cached = _readCache()
  if (cached && cached.expiresAt > now) return cached.url

  const url = await _discover()
  // 30 min TTL. The discovery is 3 AWS API calls (~1.5s from a laptop);
  // hammering it on every request is what made the drawer feel slow in
  // dev mode, since opening a card triggers /tasks/{id} + /home-channels +
  // /log + maybe /events serially. Cache is invalidated on 5xx/network
  // errors anyway, so a long TTL doesn't risk staleness across redeploys.
  _writeCache({ url, expiresAt: now + 30 * 60 * 1_000 })
  return url
}

/** Evict the cache (e.g. after a 502 / connection-refused so next call re-discovers). */
export function invalidateHermesEndpointCache(): void {
  _writeCache(null)
}

/**
 * Fire-and-forget warmup. Call from server components that will later make
 * /api/hermes/* requests so the 1.5 s ECS discovery runs in parallel with
 * HTML streaming instead of stacking in front of the first proxy hit.
 */
export function warmHermesEndpoint(): void {
  getHermesDashboardUrl().catch(() => { /* discovery errors surface at request time */ })
}

async function _discover(): Promise<string> {
  const ecs = new ECSClient({ region: REGION })
  const ec2 = new EC2Client({ region: REGION })

  // 1. Find the running task ARN.
  const listRes = await ecs.send(
    new ListTasksCommand({
      cluster:     CLUSTER,
      serviceName: SERVICE,
      desiredStatus: 'RUNNING',
    }),
  )
  const taskArn = listRes.taskArns?.[0]
  if (!taskArn) throw new Error('[hermesEndpoint] No running Hermes task found in ECS')

  // 2. Describe the task to get the ENI attachment.
  const descRes = await ecs.send(
    new DescribeTasksCommand({ cluster: CLUSTER, tasks: [taskArn] }),
  )
  const task = descRes.tasks?.[0]
  if (!task) throw new Error('[hermesEndpoint] DescribeTasks returned no task')

  const eniAttachment = task.attachments?.find(a => a.type === 'ElasticNetworkInterface')
  const eniId = eniAttachment?.details?.find(d => d.name === 'networkInterfaceId')?.value
  if (!eniId) throw new Error('[hermesEndpoint] Could not find ENI for Hermes task')

  // 3. Resolve the public IP from the ENI.
  const niRes = await ec2.send(
    new DescribeNetworkInterfacesCommand({ NetworkInterfaceIds: [eniId] }),
  )
  const publicIp = niRes.NetworkInterfaces?.[0]?.Association?.PublicIp
  if (!publicIp) throw new Error('[hermesEndpoint] Hermes task has no public IP (check assignPublicIp)')

  const url = `http://${publicIp}:${PROXY_PORT}`
  console.log(`[hermesEndpoint] Discovered Hermes at ${url} (task ${taskArn.split('/').pop()})`)
  return url
}
