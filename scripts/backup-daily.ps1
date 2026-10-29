$ErrorActionPreference = 'Stop'
$taskWorkspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskWorkspace
$taskConfiguration = Get-Content -LiteralPath (Join-Path $taskWorkspace 'data/deployment/backup-task.json') -Raw | ConvertFrom-Json
$taskLog = Join-Path $taskWorkspace 'data/deployment/backup-latest.log'
& $taskConfiguration.node 'scripts/run-ts.cjs' 'scripts/cloud-backup.ts' 'production' $taskConfiguration.destination *> $taskLog
$taskExitCode = $LASTEXITCODE
if ($taskExitCode -ne 0) { exit $taskExitCode }
exit 0
