#Requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Position = 0)][string]$Command = 'help',
  [Parameter(Position = 1)][string]$Argument,
  [string]$Bind,
  [int]$BootBudget,
  [int]$ShellBudget
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$COMMANDS = @('up', 'down', 'purge', 'doctor', 'reset', 'ssh', 'status', 'grade', 'help')

$UI = 'http://localhost:8080'
$USAGE = 'usage: .\sim.ps1 {up [bank]|down|reset|purge [--all]|doctor|ssh [instance]|status|grade}'

# Mirrors json_field() in sim: a missing key yields '' rather than throwing.
function Get-Field($Object, [string]$Name) {
  if ($null -eq $Object) { return '' }
  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop -or $null -eq $prop.Value) { return '' }
  return [string]$prop.Value
}

# curl -fsS --max-time 5 "$UI/api/boot", returning $null instead of failing.
function Get-Json([string]$Path, [int]$TimeoutSec = 5) {
  try {
    return Invoke-RestMethod -Uri "$UI$Path" -TimeoutSec $TimeoutSec -ErrorAction Stop
  } catch {
    return $null
  }
}

# $ErrorActionPreference does not catch a native binary's exit code.
function Invoke-Docker {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$DockerArgs)
  & docker @DockerArgs
  if ($LASTEXITCODE -ne 0) {
    throw "docker $($DockerArgs -join ' ') exited $LASTEXITCODE"
  }
}

function Set-Env([string]$Name, $Value) {
  # Assigning $null to $env:X is not portable across 5.1 and 7; this removes it.
  [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function Get-Budget([int]$Param, [string]$EnvName, [int]$Default) {
  if ($Param -gt 0) { return $Param }
  $fromEnv = [Environment]::GetEnvironmentVariable($EnvName, 'Process')
  if ($fromEnv) { return [int]$fromEnv }
  return $Default
}

function Invoke-Up([string]$Bank) {
  if ($Bind) { Set-Env 'SIM_BIND' $Bind }

  $previousBank = [Environment]::GetEnvironmentVariable('BANK', 'Process')
  try {
    Set-Env 'BANK' $Bank
    Invoke-Docker compose up -d --build
  } finally {
    Set-Env 'BANK' $previousBank
  }

  $last = ''
  $sw = [Diagnostics.Stopwatch]::StartNew()

  if (-not $Bank) {
    $deadline = Get-Budget $ShellBudget 'SIM_SHELL_BUDGET' 300
    while ($true) {
      if ($sw.Elapsed.TotalSeconds -ge $deadline) {
        Write-Host ''
        Write-Host 'The environment did not finish starting up. Check with:'
        Write-Host '  docker compose logs k8s-env'
        exit 1
      }
      $boot = Get-Json '/api/boot'
      if ($null -eq $boot) { Start-Sleep -Seconds 2; continue }

      $label = Get-Field $boot 'label'
      if ($label -and $label -ne $last) { Write-Host "  $label"; $last = $label }

      switch (Get-Field $boot 'state') {
        'idle' {
          Write-Host "Ready. Choose an exam at ${UI} - its environment is built when you pick one."
          exit 0
        }
        'ready' {
          Write-Host "Exam environment ready. Exam UI: ${UI} - or .\sim.ps1 ssh instance-1"
          exit 0
        }
        'failed' {
          Write-Host ''
          Write-Host 'The environment failed to start:'
          Write-Host "  $(Get-Field $boot 'error')"
          Write-Host ''
          Write-Host 'Full output:  docker compose logs k8s-env'
          exit 1
        }
      }
      Start-Sleep -Seconds 2
    }
  }

  $budget = Get-Budget $BootBudget 'SIM_BOOT_BUDGET' 3600
  Write-Host 'Building the exam environment (first run pulls and seeds; later runs resume)...'
  while ($true) {
    if ($sw.Elapsed.TotalSeconds -ge $budget) {
      Write-Host ''
      Write-Host "Gave up waiting after ${budget}s. The environment may still be working;"
      Write-Host 'check with:  docker compose logs -f k8s-env'
      Write-Host 'Raise the budget with .\sim.ps1 up <bank> -BootBudget <seconds>'
      exit 1
    }
    $boot = Get-Json '/api/boot'
    if ($null -eq $boot) { Start-Sleep -Seconds 3; continue }

    $label = Get-Field $boot 'label'
    $detail = Get-Field $boot 'detail'
    $line = $label
    if ($detail) { $line = "$label - $detail" }
    if ($line -and $line -ne $last) { Write-Host "  $line"; $last = $line }

    $state = Get-Field $boot 'state'
    if ($state -eq 'ready') { break }
    if ($state -eq 'failed') {
      Write-Host ''
      Write-Host 'The environment failed to start:'
      Write-Host "  $(Get-Field $boot 'error')"
      Write-Host ''
      Write-Host 'Full output:  docker compose logs k8s-env'
      exit 1
    }
    Start-Sleep -Seconds 3
  }
  Write-Host "Exam environment ready. Exam UI: ${UI} - or .\sim.ps1 ssh instance-1"
}

function Invoke-Purge([string]$Mode) {
  if ($Mode -eq '--all') {
    Write-Host 'Removing EVERY volume, including attempt history: every attempt graded on'
    Write-Host 'this machine is deleted, there is no backup, and there is no undo.'
    Write-Host '(Export it first from the app if you want to keep it.)'
    Invoke-Docker compose down -v --remove-orphans
    Write-Host 'Purged, attempt history included.'
    return
  }
  if ($Mode) { Write-Host 'usage: .\sim.ps1 purge [--all]' ; exit 1 }

  $project = ''
  $raw = (& docker compose config --format json 2>$null) -join "`n"
  if ($LASTEXITCODE -eq 0 -and $raw) {
    $project = Get-Field ($raw | ConvertFrom-Json) 'name'
  }
  if (-not $project) {
    Write-Host 'Could not determine the compose project name; refusing to guess which'
    Write-Host 'volumes are ours. Nothing was removed - the environment is untouched.'
    Write-Host 'Remove everything, attempt history included, with: .\sim.ps1 purge --all'
    exit 1
  }

  Invoke-Docker compose down --remove-orphans

  $kept = $false
  $volumes = & docker volume ls -q --filter "label=com.docker.compose.project=$project"
  foreach ($vol in $volumes) {
    if (-not $vol) { continue }
    $key = & docker volume inspect -f '{{index .Labels "com.docker.compose.volume"}}' $vol 2>$null
    if ($key -eq 'state') { $kept = $true; continue }
    & docker volume rm $vol > $null 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Host "  could not remove ${vol} (still in use?)" }
  }

  if ($kept) {
    Write-Host 'Purged. Attempt history was kept - remove it too with: .\sim.ps1 purge --all'
  } else {
    Write-Host 'Purged. There was no attempt history to keep.'
  }
}

function Invoke-Reset {
  Write-Host 'Resetting exam state via conductor (cluster + instances, cached images kept)...'
  try {
    Invoke-RestMethod -Uri "$UI/api/control/reset" -Method Post -TimeoutSec 30 -ErrorAction Stop | Out-Null
  } catch {
    Write-Host "The conductor would not accept a reset: $($_.Exception.Message)"
    Write-Host 'It is busy while a bank switch, a reseed, or the preparation of a drawn'
    Write-Host 'attempt is running. See what it is doing with:'
    Write-Host "  Invoke-RestMethod $UI/api/control/status"
    exit 1
  }

  $status = $null
  while ($true) {
    Start-Sleep -Seconds 3
    $status = Get-Json '/api/control/status'
    if ($null -eq $status) { continue }
    if ($status.busy -eq $false) { break }
  }

  $lastJob = $status.PSObject.Properties['lastJob']
  if ($lastJob -and $lastJob.Value) {
    $err = Get-Field $lastJob.Value 'error'
    if ($err) { Write-Host "Reset failed: $err"; exit 1 }
  }
  Write-Host 'Fresh exam ready.'
}

function Invoke-Doctor {
  Write-Host 'kubestronaut-sim preflight'
  Write-Host ''
  Write-Host ('host              : Windows ({0})' -f $PSVersionTable.PSEdition)
  Write-Host ('powershell        : {0}' -f $PSVersionTable.PSVersion)

  $server = & docker version --format '{{.Server.Version}}' 2>$null
  Write-Host ('docker            : {0}' -f $(if ($LASTEXITCODE -eq 0 -and $server) { $server } else { 'NOT REACHABLE' }))

  $compose = & docker compose version --short 2>$null
  Write-Host ('compose           : {0}' -f $(if ($LASTEXITCODE -eq 0 -and $compose) { $compose } else { 'MISSING' }))

  $ostype = & docker info --format '{{.OSType}}' 2>$null
  if ($ostype -eq 'linux') {
    Write-Host 'container OS      : linux   ok'
  } else {
    Write-Host ("container OS      : {0}   << must be linux - switch Docker Desktop to Linux containers" -f $ostype)
  }

  $mem = & docker info --format '{{.MemTotal}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $mem) { $mem = 0 }
  $memgb = [math]::Floor([int64]$mem / 1GB)
  if ($memgb -lt 8) {
    Write-Host ("RAM to docker     : {0}GB   << LOW: raise it in %UserProfile%\.wslconfig (memory=10GB), then wsl --shutdown" -f $memgb)
  } else {
    Write-Host ("RAM to docker     : {0}GB   ok" -f $memgb)
  }

  $avail = & docker run --rm -v /var/lib/docker alpine:3.21 sh -c 'df -Pk /var/lib/docker | awk "NR==2{print int(\$4/1024/1024)}"' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $avail) { $avail = '?' }
  if ($avail -ne '?' -and [int]$avail -lt 25) {
    Write-Host ("disk for images   : {0}GB   << LOW: images alone are ~10GB" -f $avail)
  } else {
    Write-Host ("disk for images   : {0}GB   ok" -f $avail)
  }

  $cg = & docker info --format '{{.CgroupVersion}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $cg) { $cg = 'unknown' }
  if ($cg -eq '1') {
    Write-Host 'cgroup version    : 1   << the instances need cgroup v2 (compose sets cgroup: host)'
  } else {
    Write-Host ("cgroup version    : {0}" -f $cg)
  }

  $warm = @(& docker volume ls -q --filter name=kubestronaut-sim 2>$null).Count
  if ($warm -eq 0) {
    Write-Host 'warm volumes      : none - this will be a cold first boot (slowest path)'
  } else {
    Write-Host ("warm volumes      : {0} present - boot will resume rather than rebuild" -f $warm)
  }

  $boot = Get-Json '/api/boot' 3
  if ($null -eq $boot) {
    Write-Host 'exam UI           : not running'
  } else {
    Write-Host ("exam UI           : up (state: {0})" -f (Get-Field $boot 'state'))
  }
}

if ($COMMANDS -notcontains $Command) {
  Write-Host $USAGE
  exit 1
}

switch ($Command) {
  'up'     { Invoke-Up $Argument }
  'down'   { Invoke-Docker compose down --remove-orphans }
  'purge'  { Invoke-Purge $Argument }
  'doctor' { Invoke-Doctor }
  'reset'  { Invoke-Reset }
  'ssh'    {
    $instance = if ($Argument) { $Argument } else { 'instance-1' }
    Invoke-Docker compose exec $instance su - candidate
  }
  'status' { Invoke-Docker compose ps }
  'grade'  { Invoke-Docker compose exec facilitator /entrypoint.sh grade }
  'help'   { Write-Host $USAGE }
}
