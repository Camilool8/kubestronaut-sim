#!/usr/bin/env bash
# The launchers must repair a CRLF working tree before building, because a
# clone made before .gitattributes landed (5471f83) keeps CRLF forever: git
# does not re-check-out files a pull did not otherwise touch. Those CRs reach
# bash inside the containers as 'set: pipefail\r: invalid option name'.
# check-line-endings.sh gates the repo; this gates the repair of a checkout.
set -euo pipefail
cd "$(dirname "$0")/.."

repo=$(pwd)
fail=0

fn=$(sed -n '/^normalize_line_endings() {/,/^}/p' sim)
if [ -z "$fn" ]; then
  echo "check-crlf-repair: sim has no normalize_line_endings() to extract" >&2
  exit 1
fi

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
cd "$scratch"
git init -q .
mkdir -p banks/x/q01
printf 'set -euo pipefail\r\necho hi\r\n' > banks/x/q01/setup.sh
chmod +x banks/x/q01/setup.sh
printf 'echo clean\n' > banks/x/q02.sh
git add -A

eval "$fn"
normalize_line_endings > /dev/null

if grep -qI "$(printf '\r')$" banks/x/q01/setup.sh; then
  echo "check-crlf-repair: CRLF survived the repair in setup.sh" >&2
  fail=1
fi
if [ ! -x banks/x/q01/setup.sh ]; then
  echo "check-crlf-repair: the repair dropped the executable bit" >&2
  fail=1
fi
if [ "$(cat banks/x/q02.sh)" != "echo clean" ]; then
  echo "check-crlf-repair: an already-LF file was altered" >&2
  fail=1
fi

cd "$repo"

# The PowerShell mirror cannot be executed here (CI runs this gate on Linux);
# the Windows job exercises it for real. Gate the wiring so it cannot silently
# drift out of sim.ps1.
grep -q '^function Repair-LineEndings {' sim.ps1 || {
  echo "check-crlf-repair: sim.ps1 has no Repair-LineEndings function" >&2
  fail=1
}
# Two mentions: the definition, and the call in Invoke-Up. Invoke-Doctor
# deliberately does NOT call it -- doctor reports, it never writes -- so it
# inlines its own detection instead. Do not raise this to 3.
[ "$(grep -c 'Repair-LineEndings' sim.ps1)" -ge 2 ] || {
  echo "check-crlf-repair: Repair-LineEndings is defined but never called from Invoke-Up" >&2
  fail=1
}

[ "$fail" = 0 ] || exit 1
echo "check-crlf-repair: bash repair works; PowerShell mirror is wired"
