# hermes-forward.ps1 — Tunnel localhost:9120 → Hermes mc_proxy on ECS.
#
# Started automatically by "npm run dev" (via concurrently).
# Can also be run manually in a separate PowerShell window.
#
# Creates an SSM port-forwarding session so the Next.js server can reach
# mc_proxy at http://localhost:9120 without going over the public internet.
#
# Requirements:
#   - AWS CLI v2  (aws --version should show "aws-cli/2.x.x")
#   - AWS Session Manager Plugin  (separate install from AWS CLI)
#     Windows: https://s3.amazonaws.com/session-manager-downloads/plugin/latest/windows/SessionManagerPluginSetup.exe

$CLUSTER     = "hermes-agent"
$SERVICE     = "hermes-agent"
$CONTAINER   = "hermes-agent"
$REMOTE_PORT = "9120"
$LOCAL_PORT  = "9120"

Write-Host "[hermes] Looking up running task in cluster $CLUSTER..." -ForegroundColor Cyan

$TASK_ARN = aws ecs list-tasks `
  --cluster $CLUSTER `
  --service-name $SERVICE `
  --desired-status RUNNING `
  --query 'taskArns[0]' `
  --output text

if (-not $TASK_ARN -or $TASK_ARN -eq "None") {
  Write-Host "[hermes] ERROR: No running tasks found in service $SERVICE" -ForegroundColor Red
  Write-Host "[hermes] Next.js will fall back to public-IP auto-discovery." -ForegroundColor Yellow
  exit 0
}

$TASK_ID = $TASK_ARN.Split("/")[-1]
$TARGET  = "ecs:${CLUSTER}_${TASK_ID}_${CONTAINER}"

Write-Host "[hermes] Forwarding localhost:$LOCAL_PORT -> container:$REMOTE_PORT" -ForegroundColor Green
Write-Host "[hermes] Task: $TASK_ID" -ForegroundColor DarkGray
Write-Host "[hermes] Ctrl-C stops the tunnel (Next.js will auto-discover the public IP instead)." -ForegroundColor DarkGray

# PS 5.1 strips double-quotes from --parameters passed to native exes.
# Workaround: write JSON to a temp file and pass file:// URI.
$paramsJson = '{"portNumber":["' + $REMOTE_PORT + '"],"localPortNumber":["' + $LOCAL_PORT + '"]}'
$tmpFile    = "$env:TEMP\hermes-params-$PID.json"
$paramsJson | Set-Content -Path $tmpFile -Encoding ascii
$fileUri    = "file://" + ($tmpFile -replace '\\', '/')

try {
    aws ssm start-session `
      --target $TARGET `
      --document-name AWS-StartPortForwardingSession `
      --parameters $fileUri
} finally {
    Remove-Item $tmpFile -ErrorAction SilentlyContinue
}
