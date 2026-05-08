#!/usr/bin/env bash
# hermes-forward.sh — Forward localhost:9119 → Hermes dashboard on ECS.
#
# Run this in a separate terminal before starting Mission Control with HERMES_TRANSPORT=direct.
# Keep it running for the duration of your dev session. Ctrl-C to stop.
#
# Requirements:
#   - AWS CLI v2
#   - Session Manager plugin  (brew install --cask session-manager-plugin  OR  see AWS docs)
#   - ECS exec enabled on the hermes-agent service (it is — we use it for deploy)
#
# Usage:
#   chmod +x scripts/hermes-forward.sh
#   ./scripts/hermes-forward.sh

set -euo pipefail

CLUSTER="hermes-agent"
SERVICE="hermes-agent"
CONTAINER="hermes-agent"
REMOTE_PORT="9119"
LOCAL_PORT="9119"

echo "→ Looking up running task in cluster ${CLUSTER}..."
TASK_ARN=$(aws ecs list-tasks \
  --cluster "$CLUSTER" \
  --service-name "$SERVICE" \
  --desired-status RUNNING \
  --query 'taskArns[0]' \
  --output text)

if [[ -z "$TASK_ARN" || "$TASK_ARN" == "None" ]]; then
  echo "✗ No running tasks found in service ${SERVICE}" >&2
  exit 1
fi

TASK_ID=$(basename "$TASK_ARN")
TARGET="ecs:${CLUSTER}_${TASK_ID}_${CONTAINER}"

echo "→ Task:   $TASK_ARN"
echo "→ Target: $TARGET"
echo "→ Forwarding localhost:${LOCAL_PORT} → container:${REMOTE_PORT}"
echo ""
echo "  Keep this terminal open while using Mission Control."
echo "  Ctrl-C to stop forwarding."
echo ""

aws ssm start-session \
  --target "$TARGET" \
  --document-name AWS-StartPortForwardingSession \
  --parameters "{\"portNumber\":[\"${REMOTE_PORT}\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}"
