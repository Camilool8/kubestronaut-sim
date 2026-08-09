#Requires -Version 5.1
# Deliberately NOT [CmdletBinding()], and no [Parameter()] attribute on any
# parameter below: either one makes this an *advanced* script, whose binder
# treats a leading "-" on any token (e.g. the "--all" a user is told on
# screen to pass to purge) as an attempt to match a declared parameter name
# and hard-errors when nothing matches. As a plain script, an unmatched
# dash-token just falls through to $args untouched, while $Command and
# $Argument still bind positionally (by declaration order) and -Bind /
# -BootBudget / -ShellBudget still bind by name -- both verified empirically
# against this exact param block, see task-6-report.md.
param(
  [string]$Command = 'help',
  [string]$Argument,
  [string]$Bind,
  [int]$BootBudget,
  [int]$ShellBudget
)

# A basic script/function's binder tries named matching FIRST for any token
# starting with "-": if nothing matches, it drops straight into $args and is
# skipped for positional purposes entirely -- it does not fall through to
# fill $Argument. So "purge --all" (verified empirically) binds $Command to
# 'purge' but leaves $Argument empty and stashes '--all' in $args alone.
# Recover it here, same as sim's own "${2:-}" would.
if (-not $Argument -and $args.Count -gt 0) { $Argument = [string]$args[0] }

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

# $ErrorActionPreference does not catch a native binary's exit code -- that's
# what the explicit check below is for. This is a *basic* function (no
# param() block at all, so no [CmdletBinding()] and no [Parameter()]
# attribute anywhere) on purpose: an advanced function's parameter binder
# prefix-matches dashed tokens against its own declared parameters before
# they ever reach docker -- "-d" would bind to a same-named/prefixed
# parameter instead of passing through, "-v" would bind to the built-in
# -Verbose switch and silently vanish. Using the automatic $args variable
# means nothing passed here is ever a parameter-binding candidate; it all
# reaches docker byte for byte. Reserved for callers that must abort on
# failure (up, purge) -- see the dispatch tail for the down/ssh/status/grade
# pass-through commands, which call docker directly and propagate its exit
# code instead of throwing.
function Invoke-Docker {
  & docker @args
  if ($LASTEXITCODE -ne 0) {
    throw "docker $($args -join ' ') exited $LASTEXITCODE"
  }
}

# Two 5.1-only failure modes converge on the same fix, so both use this:
#   1. doctor must degrade gracefully, never crash, when docker isn't even
#      on PATH -- that's the single most likely reason someone runs it.
#   2. On Windows PowerShell 5.1, a native command that writes to stderr
#      WHILE stderr is redirected (exactly what "2>$null" does) raises a
#      terminating NativeCommandError under $ErrorActionPreference = 'Stop'.
#      purge's project-name lookup, label read, and volume removal all
#      redirect stderr for a command that can legitimately fail (an in-use
#      volume's "docker volume rm" ALWAYS writes to stderr) -- without this,
#      5.1 would abort mid-loop instead of printing the friendly "still in
#      use?" message and moving on to the next volume, the way sim does.
# In both cases 2>$null cannot suppress the error itself (case 1: no child
# process ever existed to redirect; case 2: the redirection is what
# triggers it), so it has to be caught. Basic function, same reasoning as
# Invoke-Docker: no param() block, so dashed probe args (--format, -v, -f,
# -q) are never parameter-binding candidates.
function Invoke-DockerSafe {
  try {
    & docker @args 2>$null
  } catch {
    $global:LASTEXITCODE = 1
  }
}

# Same trap as Invoke-DockerSafe, same fix, for git instead of docker: a
# missing `git` (GitHub Desktop's bundled copy never lands on PATH; a ZIP
# download has no git at all) raises a *terminating* CommandNotFoundException
# under $ErrorActionPreference = 'Stop' that 2>$null cannot suppress -- there
# is no process yet to redirect. On Windows PowerShell 5.1, `git rev-parse`
# outside a work tree hits the same NativeCommandError trap: it writes to
# stderr while stderr is redirected. Repair-LineEndings and Invoke-Doctor's
# line-endings check both depend on "git missing or outside a work tree"
# failing safely (non-zero exit, no throw) to keep their documented "no-op
# outside a git work tree" contract instead of aborting `up`/`doctor` on
# their very first line.
function Invoke-GitSafe {
  try {
    & git @args 2>$null
  } catch {
    $global:LASTEXITCODE = 1
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

# Shared by Repair-LineEndings and Invoke-Doctor so both agree on what "has
# CRLF" means: a lone CR (mid-line, or as a file's final byte) is not
# something the collapse loop below rewrites, so a predicate that only checks
# "does byte 13 appear anywhere" would make doctor report N script(s) have
# CRLF on the same tree the repair just reported 0 script(s) for.
function Test-HasCrlfPair([byte[]]$Bytes) {
  for ($i = 0; $i -lt $Bytes.Length - 1; $i++) {
    if ($Bytes[$i] -eq 13 -and $Bytes[$i + 1] -eq 10) { return $true }
  }
  return $false
}

# Mirrors normalize_line_endings() in sim -- see the long comment there for why
# a Windows clone keeps CRLF forever and what it breaks. Byte-level CRLF -> LF
# rather than Get-Content/Set-Content: Set-Content re-encodes on write and
# would put the CRLFs straight back on Windows, and would add a BOM under 5.1.
function Repair-LineEndings {
  $null = Invoke-GitSafe rev-parse --is-inside-work-tree
  if ($LASTEXITCODE -ne 0) { return 0 }

  $listed = Invoke-GitSafe ls-files -- 'sim' '*.sh' 'images/k8s-env/preload.txt'
  if ($LASTEXITCODE -ne 0 -or -not $listed) { return 0 }

  $fixed = 0
  foreach ($rel in $listed) {
    if (-not (Test-Path -LiteralPath $rel)) { continue }
    # Resolve once, up front, and read/write that same absolute path.
    # [System.IO.File]::ReadAllBytes/WriteAllBytes resolve a relative path
    # against [Environment]::CurrentDirectory, which Set-Location
    # $PSScriptRoot (above) does NOT update -- so on a real Windows
    # PowerShell that started elsewhere and cd'd into the repo, Test-Path
    # (which DOES follow Set-Location) passes here while a bare
    # ReadAllBytes($rel) throws MethodInvocationException: "Could not find
    # file". Reproduced empirically: Test-Path -LiteralPath "sim" = True,
    # ReadAllBytes("sim") THREW "Could not find file
    # '<CurrentDirectory>\sim'". Resolve-Path follows Set-Location like
    # Test-Path does, so resolving first keeps every byte-level call below
    # looking at the file the guard above just confirmed exists.
    $full = (Resolve-Path -LiteralPath $rel).Path
    $bytes = [System.IO.File]::ReadAllBytes($full)
    if (-not (Test-HasCrlfPair $bytes)) { continue }
    $out = New-Object System.Collections.Generic.List[byte]
    for ($i = 0; $i -lt $bytes.Length; $i++) {
      if ($bytes[$i] -eq 13 -and $i + 1 -lt $bytes.Length -and $bytes[$i + 1] -eq 10) { continue }
      $out.Add($bytes[$i])
    }
    # Belt-and-suspenders against Test-HasCrlfPair and this loop ever
    # disagreeing again: only write, and only count as fixed, if the byte
    # count actually shrank.
    if ($out.Count -eq $bytes.Length) { continue }
    [System.IO.File]::WriteAllBytes($full, $out.ToArray())
    $fixed++
  }
  return $fixed
}

function Invoke-Up([string]$Bank) {
  $repaired = Repair-LineEndings
  if ($repaired -gt 0) {
    Write-Host "Repaired CRLF line endings in $repaired script(s) - they cannot run inside the containers."
  }
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
  $raw = (Invoke-DockerSafe compose config --format json) -join "`n"
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
  $unreadable = 0
  $volumes = & docker volume ls -q --filter "label=com.docker.compose.project=$project"
  foreach ($vol in $volumes) {
    if (-not $vol) { continue }
    # NOT '{{index .Labels "com.docker.compose.volume"}}': Windows
    # PowerShell 5.1 wraps a native argument in "..." whenever it contains
    # whitespace, but does not escape double quotes already inside it -- an
    # argument with both (like that template) reaches docker.exe truncated
    # at the embedded quote, "docker volume inspect" exits non-zero, 2>$null
    # hides it, and the state volume looks unlabeled and gets deleted along
    # with everything else. "{{json .Labels}}" has whitespace but no
    # embedded double quote, so 5.1's plain wrap-in-quotes is safe; decoding
    # the label map ourselves sidesteps the native templating quoting
    # entirely.
    $labelsRaw = Invoke-DockerSafe volume inspect -f '{{json .Labels}}' $vol
    # Fail closed: a read failure here means we do NOT know whether $vol is
    # the attempt-history volume, so it must NOT be deleted. Defaulting
    # $key to '' and letting it silently miss the 'state' comparison below
    # (the old code did exactly that) is how the state volume itself gets
    # destroyed by nothing worse than a transient inspect error.
    if ($LASTEXITCODE -ne 0 -or -not $labelsRaw) {
      Write-Host "  could not read ${vol}'s label (docker volume inspect failed) - leaving it in place"
      $unreadable++
      continue
    }
    $labels = ($labelsRaw -join '') | ConvertFrom-Json
    $key = Get-Field $labels 'com.docker.compose.volume'
    if ($key -eq 'state') { $kept = $true; continue }
    # An in-use volume ALWAYS makes "docker volume rm" write to stderr --
    # exactly the case Invoke-DockerSafe exists to survive on 5.1, and
    # exactly the case the line below exists to report instead of crashing
    # the whole loop out from under the remaining volumes.
    Invoke-DockerSafe volume rm $vol | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "  could not remove ${vol} (still in use?)" }
  }

  if ($kept) {
    Write-Host 'Purged. Attempt history was kept - remove it too with: .\sim.ps1 purge --all'
  } elseif ($unreadable -gt 0) {
    Write-Host "Purged. $unreadable volume(s) could not be checked and were left in place, just in case - see: docker volume ls"
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

  $crlf = 0
  $null = Invoke-GitSafe rev-parse --is-inside-work-tree
  if ($LASTEXITCODE -eq 0) {
    $listed = Invoke-GitSafe ls-files -- 'sim' '*.sh' 'images/k8s-env/preload.txt'
    foreach ($rel in $listed) {
      if (-not (Test-Path -LiteralPath $rel)) { continue }
      # Same predicate Repair-LineEndings uses to decide what it would
      # actually rewrite -- see Test-HasCrlfPair -- so this never reports a
      # count `.\sim.ps1 up` wouldn't also report as repaired. And the same
      # CurrentDirectory trap as Repair-LineEndings applies here too: resolve
      # before reading, or ReadAllBytes throws for anyone who cd'd in rather
      # than starting a shell already rooted at the repo.
      $full = (Resolve-Path -LiteralPath $rel).Path
      if (Test-HasCrlfPair ([System.IO.File]::ReadAllBytes($full))) { $crlf++ }
    }
  }
  if ($crlf -eq 0) {
    Write-Host 'line endings      : LF   ok'
  } else {
    Write-Host ("line endings      : {0} script(s) have CRLF   << they cannot run in the containers; .\sim.ps1 up repairs them" -f $crlf)
  }

  $server = Invoke-DockerSafe version --format '{{.Server.Version}}'
  Write-Host ('docker            : {0}' -f $(if ($LASTEXITCODE -eq 0 -and $server) { $server } else { 'NOT REACHABLE' }))

  $compose = Invoke-DockerSafe compose version --short
  Write-Host ('compose           : {0}' -f $(if ($LASTEXITCODE -eq 0 -and $compose) { $compose } else { 'MISSING' }))

  $ostype = Invoke-DockerSafe info --format '{{.OSType}}'
  if (-not $ostype) { $ostype = 'unknown' }
  if ($ostype -eq 'linux') {
    Write-Host 'container OS      : linux   ok'
  } else {
    Write-Host ("container OS      : {0}   << must be linux - switch Docker Desktop to Linux containers" -f $ostype)
  }

  $mem = Invoke-DockerSafe info --format '{{.MemTotal}}'
  if ($LASTEXITCODE -ne 0 -or -not $mem) { $mem = 0 }
  $memgb = [math]::Floor([int64]$mem / 1GB)
  if ($memgb -lt 8) {
    Write-Host ("RAM to docker     : {0}GB   << LOW: raise it in %UserProfile%\.wslconfig (memory=10GB), then wsl --shutdown" -f $memgb)
  } else {
    Write-Host ("RAM to docker     : {0}GB   ok" -f $memgb)
  }

  # NOT 'df -Pk /var/lib/docker | awk "NR==2{print int(\$4/1024/1024)}"':
  # that argument has both whitespace and an embedded double quote, which
  # Windows PowerShell 5.1 mangles the same way the volume-label template
  # above did (see the comment in Invoke-Purge). Single-quoting the awk
  # program instead needs no embedded double quote at all -- only single
  # quotes, which 5.1's argv construction never touches -- so $4 needs no
  # backslash escaping either, since single quotes already stop the
  # container's own shell from expanding it.
  $awkArg = 'df -Pk /var/lib/docker | awk ''NR==2{print int($4/1024/1024)}'''
  $avail = Invoke-DockerSafe run --rm -v /var/lib/docker alpine:3.21 sh -c $awkArg
  # Guard the [int] cast, not just the exit code: multi-line or otherwise
  # non-numeric output would otherwise throw under $ErrorActionPreference =
  # 'Stop' and take doctor down -- the one tool meant to survive things
  # already being broken. Two traps here, both found empirically rather
  # than reasoned about, so both are commented in full:
  #   - joining a MULTI-line result before validating turns two genuinely
  #     low readings like "9" and "9" into the digit string "99", which
  #     passes ^\d+$ and reports a false "99GB ok" -- worse than the crash
  #     it replaced, since a crash sends you looking and a false ok sends
  #     you away. So: collapse only a single-element (or empty) result:
  #     anything with more than one line is unusable, full stop.
  if ($LASTEXITCODE -ne 0) {
    $avail = '?'
  } elseif ($avail -is [array]) {
    if ($avail.Count -eq 1) { $avail = [string]$avail[0] } else { $avail = '?' }
  } elseif ($null -eq $avail) {
    $avail = ''
  }
  #   - "$avail -notmatch '^\d+$'" looked equivalent to "-not ($avail
  #     -match ...)" but is not when $avail is empty: -notmatch applies
  #     PowerShell's collection-filter semantics and returns an empty
  #     Object[] rather than $true, and [bool]@() is $false, so the '?'
  #     fallback silently never fires and doctor prints a blank value
  #     inside a LOW warning. Forcing scalar boolean coercion with -not
  #     (... -match ...) avoids that; $mem/$cg/$ostype's sibling guards
  #     use "-not $var" for the same reason and were never at risk.
  if ($avail -ne '?' -and -not ($avail -match '^\d+$')) { $avail = '?' }
  if ($avail -ne '?' -and [int]$avail -lt 25) {
    Write-Host ("disk for images   : {0}GB   << LOW: images alone are ~10GB" -f $avail)
  } else {
    Write-Host ("disk for images   : {0}GB   ok" -f $avail)
  }

  $cg = Invoke-DockerSafe info --format '{{.CgroupVersion}}'
  if ($LASTEXITCODE -ne 0 -or -not $cg) { $cg = 'unknown' }
  if ($cg -eq '1') {
    Write-Host 'cgroup version    : 1   << the instances need cgroup v2 (compose sets cgroup: host)'
  } else {
    Write-Host ("cgroup version    : {0}" -f $cg)
  }

  $warm = @(Invoke-DockerSafe volume ls -q --filter name=kubestronaut-sim).Count
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

# down/ssh/status/grade call docker directly and exit with its own code,
# instead of going through Invoke-Docker: sim under `set -e` propagates
# docker's own exit status for these with no extra message, and Invoke-
# Docker's throw would flatten that to a generic terminating-error exit (1)
# regardless of what docker actually returned -- e.g. a candidate's Ctrl-C
# out of `ssh` (exit 130) would look like a launcher crash instead of an
# interrupted session. up and purge keep throwing: they have follow-on logic
# (the boot-poll loop, volume cleanup) that must not run after a failure.
switch ($Command) {
  'up'     { Invoke-Up $Argument }
  'down'   { & docker compose down --remove-orphans; exit $LASTEXITCODE }
  'purge'  { Invoke-Purge $Argument }
  'doctor' { Invoke-Doctor }
  'reset'  { Invoke-Reset }
  'ssh'    {
    $instance = if ($Argument) { $Argument } else { 'instance-1' }
    & docker compose exec $instance su - candidate
    exit $LASTEXITCODE
  }
  'status' { & docker compose ps; exit $LASTEXITCODE }
  'grade'  { & docker compose exec facilitator /entrypoint.sh grade; exit $LASTEXITCODE }
  'help'   { Write-Host $USAGE; exit 0 }
}
