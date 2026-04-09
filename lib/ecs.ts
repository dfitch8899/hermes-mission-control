import { ECSClient, ListTasksCommand, DescribeTasksCommand, DescribeServicesCommand } from '@aws-sdk/client-ecs'

export const ecs = new ECSClient({ region: process.env.AWS_REGION || 'us-east-2' })

export { ListTasksCommand, DescribeTasksCommand, DescribeServicesCommand }

export const ECS_CLUSTER = process.env.ECS_CLUSTER || 'hermes-agent'
export const ECS_SERVICE = process.env.ECS_SERVICE || 'hermes-agent'
