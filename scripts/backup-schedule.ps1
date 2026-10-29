param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$taskWorkspace = Split-Path -Parent $PSScriptRoot
$taskDestination = [IO.Path]::GetFullPath($Destination)
if (-not (Test-Path -LiteralPath $taskDestination -PathType Container)) { throw 'Select the existing approved backup directory.' }
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
@{ node=$taskNode; destination=$taskDestination } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskWorkspace 'data/deployment/backup-task.json') -Encoding UTF8
$taskAction = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'backup-daily.ps1') + '"') -WorkingDirectory $taskWorkspace
$taskTriggers = @((New-ScheduledTaskTrigger -Daily -At '20:30'), (New-ScheduledTaskTrigger -AtLogOn -User $taskIdentity))
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskIdentity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Arithmetica encrypted student backup' -Action $taskAction -Trigger $taskTriggers -Settings $taskSettings -Principal $taskPrincipal -Description 'Encrypted production backup to the owner-approved OneDrive folder. Runs while this Windows user is signed in; records remain in Supabase.' -Force | Select-Object TaskName,State
