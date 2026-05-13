#!/usr/bin/env bash
# hermes-forward.sh — Tunnel localhost:9120 → Hermes mc_proxy on ECS.
#
# Started automatically by "npm run dev" (via concurrently) on Mac/Linux.
# Can also be run manually: ./scripts/hermes-forward.sh
#
# Creates an SSM port-forwarding session so the Next.js server can reach
# mc_proxy at http://localhost:9120 without going over the public internet.
#
# Requirements:
#   - AWS CLI v2
#   - Session Manager plugin:  brew install --cask session-manager-plugin
#                              OR see: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html

set -euo pipefail

CLUSTER="hermes-agent"
SERVICE="hermes-agent"
CONTAINER="hermes-agent"
REMOTE_PORT="9120"
LOCAL_PORT="9120"

echo "[hermes] Looking up running task in cluster ${CLUSTER}..."
TASK_ARN=$(aws ecs list-tasks \
  --cluster "$CLUSTER" \
  --service-name "$SERVICE" \
  --desired-status RUNNING \
  --query 'taskArns[0]' \
  --output text)

if [[ -z "$TASK_ARN" || "$TASK_ARN" == "None" ]]; then
  echo "[hermes] No running tasks found in service ${SERVICE}." >&2
  echo "[hermes] Next.js will fall back to public-IP auto-discovery." >&2
  exit 0
fi

TASK_ID=$(basename "$TASK_ARN")
TARGET="ecs:${CLUSTER}_${TASK_ID}_${CONTAINER}"

echo "[hermes] Forwarding localhost:${LOCAL_PORT} -> container:${REMOTE_PORT}"
echo "[hermes] Task: ${TASK_ID}"
echo "[hermes] Ctrl-C stops the tunnel (Next.js will auto-discover the public IP instead)."

aws ssm start-session \
  --target "$TARGET" \
  --document-name AWS-StartPortForwardingSession \
  --parameters "{\"portNumber\":[\"${REMOTE_PORT}\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}"
