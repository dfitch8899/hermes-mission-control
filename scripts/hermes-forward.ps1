# hermes-forward.ps1 — Forward localhost:9119 → Hermes dashboard on ECS.
#
# Run this in a SEPARATE PowerShell window before starting Mission Control
# with HERMES_TRANSPORT=direct.  Keep it running for the dev session.
#
# Requirements:
#   - AWS CLI v2  (aws --version should say "aws-cli/2.x.x")
#   - AWS Session Manager Plugin  (separate install from AWS CLI)
#     Download: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html
#     Windows installer: https://s3.amazonaws.com/session-manager-downloads/plugin/latest/windows/SessionManagerPluginSetup.exe
#
# Usage (in a new PowerShell terminal):
#   .\scripts\hermes-forward.ps1

$CLUSTER     = "hermes-agent"
$SERVICE     = "hermes-agent"
$CONTAINER   = "hermes-agent"
$REMOTE_PORT = "9119"
$LOCAL_PORT  = "9119"

Write-Host "-> Looking up running task in cluster $CLUSTER..." -ForegroundColor Cyan

$TASK_ARN = aws ecs list-tasks `
  --cluster $CLUSTER `
  --service-name $SERVICE `
  --desired-status RUNNING `
  --query 'taskArns[0]' `
  --output text

if (-not $TASK_ARN -or $TASK_ARN -eq "None") {
  Write-Host "ERROR: No running tasks found in service $SERVICE" -ForegroundColor Red
  exit 1
}

$TASK_ID = $TASK_ARN.Split("/")[-1]
$TARGET  = "ecs:${CLUSTER}_${TASK_ID}_${CONTAINER}"

Write-Host "-> Task:   $TASK_ARN" -ForegroundColor Gray
Write-Host "-> Target: $TARGET" -ForegroundColor Gray
Write-Host "-> Forwarding localhost:$LOCAL_PORT -> container:$REMOTE_PORT" -ForegroundColor Green
Write-Host ""
Write-Host "  Keep this window open while using Mission Control." -ForegroundColor Yellow
Write-Host "  Ctrl-C to stop forwarding." -ForegroundColor Yellow
Write-Host ""

# PowerShell 5.1 on Windows strips double-quotes from --parameters values
# passed to native executables (known CreateProcess limitation).
# Workaround: write the JSON to a temp file and use the file:// prefix.
# Using -Encoding ascii avoids the UTF-8 BOM that PS 5.1 emits by default,
# which would otherwise make the JSON invalid.
$paramsJson = '{"portNumber":["' + $LOCAL_PORT + '"],"localPortNumber":["' + $REMOTE_PORT + '"]}'
$tmpFile    = "$env:TEMP\hermes-params-$PID.json"
$paramsJson | Set-Content -Path $tmpFile -Encoding ascii

# AWS CLI strips "file://" literally (7 chars) then uses the remainder as the path.
# On Windows, use file://C:/path (two slashes) — NOT file:///C:/path (three slashes).
# Three slashes produce a leading "/" that Python treats as "/C:/path" → invalid.
$fileUri = "file://" + ($tmpFile -replace '\\', '/')

Write-Host "-> Params: $paramsJson" -ForegroundColor DarkGray
Write-Host "-> File:   $tmpFile" -ForegroundColor DarkGray
Write-Host ""

try {
    aws ssm start-session `
      --target $TARGET `
      --document-name AWS-StartPortForwardingSession `
      --parameters $fileUri
} finally {
    Remove-Item $tmpFile -ErrorAction SilentlyContinue
}
