#Requires -Version 5.1
# Functional gate for sim.ps1's Repair-LineEndings, shared by
# tests/check-crlf-repair.sh and the Windows CI job so the two cannot drift.
#
# It extracts EVERY top-level function from sim.ps1, not just Repair-LineEndings.
# Repair-LineEndings calls Invoke-GitSafe and Test-HasCrlfPair, so a
# single-function extraction defines a copy that dies on the first helper it
# reaches -- which is exactly how this broke on PR #80: the extraction was
# written when the function was self-contained and went stale the moment the
# helpers were added, with nothing outside CI able to notice.
#
# Dot-sourcing sim.ps1 instead is not an option: every branch of its dispatch
# switch exits, including 'help'.
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$src = Get-Content (Join-Path $repo 'sim.ps1') -Raw

$fns = [regex]::Matches($src, '(?ms)^function .*?^\}')
if ($fns.Count -lt 3) {
  Write-Host "check-crlf-repair.ps1: expected sim.ps1 to define at least 3 functions, found $($fns.Count)"
  exit 1
}
foreach ($m in $fns) { Invoke-Expression $m.Value }

foreach ($name in 'Repair-LineEndings', 'Invoke-GitSafe', 'Test-HasCrlfPair') {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Host "check-crlf-repair.ps1: sim.ps1 no longer defines $name"
    exit 1
  }
}

$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ("crlf-repair-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
$fail = 0

try {
  Set-Location $scratch
  # Diverge [Environment]::CurrentDirectory from $PWD on purpose. Set-Location
  # does not update it, so any [System.IO.File]:: call taking a relative path
  # resolves against the wrong directory and throws -- the bug that would have
  # killed `up` and `doctor` for a user who cds into the repo.
  [Environment]::CurrentDirectory = $repo

  & git init -q .
  New-Item -ItemType Directory -Force -Path (Join-Path $scratch 'banks/x/q01') | Out-Null

  $crlf = Join-Path $scratch 'banks/x/q01/setup.sh'
  [System.IO.File]::WriteAllBytes($crlf, [byte[]](0x73, 0x65, 0x74, 0x0D, 0x0A, 0x65, 0x63, 0x68, 0x6F, 0x0D, 0x0A))
  $clean = Join-Path $scratch 'banks/x/q02.sh'
  [System.IO.File]::WriteAllBytes($clean, [byte[]](0x65, 0x63, 0x68, 0x6F, 0x0A))
  $cleanBefore = [System.IO.File]::ReadAllBytes($clean)

  & git add -A
  $n = Repair-LineEndings

  if ([System.IO.File]::ReadAllBytes($crlf) -contains 13) {
    Write-Host 'check-crlf-repair.ps1: CRLF survived the repair'
    $fail = 1
  }
  if ($n -ne 1) {
    Write-Host "check-crlf-repair.ps1: expected exactly 1 repaired file, got $n"
    $fail = 1
  }
  if (Compare-Object $cleanBefore ([System.IO.File]::ReadAllBytes($clean))) {
    Write-Host 'check-crlf-repair.ps1: an already-LF file was altered'
    $fail = 1
  }

  # Second run must be a no-op: the tree is clean now.
  if ((Repair-LineEndings) -ne 0) {
    Write-Host 'check-crlf-repair.ps1: repair is not idempotent'
    $fail = 1
  }
} finally {
  Set-Location $repo
  [Environment]::CurrentDirectory = $repo
  Remove-Item -Recurse -Force $scratch -ErrorAction SilentlyContinue
}

if ($fail -ne 0) { exit 1 }
Write-Host "check-crlf-repair.ps1: Repair-LineEndings converts CRLF to LF, leaves LF alone, and is idempotent"
# Explicit, not incidental: falling off the end would leave $LASTEXITCODE set by
# whatever native command ran last (git, here), and a caller testing
# `$LASTEXITCODE -ne 0` would be reading noise. GitHub also appends
# `exit $LASTEXITCODE` to every powershell step.
exit 0
