#!/usr/bin/env bash
# Both launchers must offer the same commands.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

# The trailing `|| true` on each of these pipelines matters: under `set -o
# pipefail`, a `grep -oE` that matches nothing exits 1, which would abort the
# whole script right here — before the `[ -z ... ]` guard below ever runs —
# and leave whoever tripped it with a bare non-zero exit and no reason why.
# `sed -n '...p'` does not have this problem (it exits 0 on no match), which
# is why usage_body() below needs no such guard.
bash_cmds=$(sed -n '/^case "\$cmd" in/,/^esac/p' sim \
  | grep -oE '^  [a-z]+\)' | tr -d ' )' | sort -u || true)

if [ -z "$bash_cmds" ]; then
  echo "check-sim-parity: sim has no 'case \"\$cmd\" in ... esac' block to read commands from" >&2
  exit 1
fi

if [ ! -f sim.ps1 ]; then
  echo "check-sim-parity: sim.ps1 does not exist; the Windows launcher is missing" >&2
  exit 1
fi

ps_cmds=$(grep -oE "^\\\$COMMANDS = @\(.*\)$" sim.ps1 \
  | grep -oE "'[a-z]+'" | tr -d "'" | sort -u || true)

if [ -z "$ps_cmds" ]; then
  echo "check-sim-parity: sim.ps1 has no '\$COMMANDS = @(...)' line to read" >&2
  exit 1
fi

if [ "$bash_cmds" != "$ps_cmds" ]; then
  echo "check-sim-parity: the launchers disagree on which commands exist." >&2
  echo "  only in sim:     $(comm -23 <(echo "$bash_cmds") <(echo "$ps_cmds") | tr '\n' ' ')" >&2
  echo "  only in sim.ps1: $(comm -13 <(echo "$bash_cmds") <(echo "$ps_cmds") | tr '\n' ' ')" >&2
  fail=1
fi

# The usage strings have to stay in step too. Compare only the {...} body: the
# prefix differs by design (./sim vs .\sim.ps1), the body must not.
usage_body() { sed -n 's/.*usage: [^ ]* \({[^}]*}\).*/\1/p' "$1" | sort -u; }

bash_usage=$(usage_body sim)
ps_usage=$(usage_body sim.ps1)

if [ -z "$bash_usage" ]; then
  echo "check-sim-parity: sim has no 'usage: ./sim {...}' line to read" >&2
  exit 1
fi
if [ -z "$ps_usage" ]; then
  echo "check-sim-parity: sim.ps1 has no 'usage: .\\sim.ps1 {...}' line to read" >&2
  exit 1
fi
if [ "$(printf '%s\n' "$bash_usage" | wc -l | tr -d ' ')" != "1" ]; then
  echo "check-sim-parity: sim's own usage strings disagree with each other:" >&2
  printf '  %s\n' "$bash_usage" >&2
  fail=1
fi
if [ "$bash_usage" != "$ps_usage" ]; then
  echo "check-sim-parity: the launchers' usage strings differ." >&2
  echo "  sim:     $bash_usage" >&2
  echo "  sim.ps1: $ps_usage" >&2
  fail=1
fi

# Every command must be documented in that shared usage body. `help` is
# deliberately absent from it: it is the default, not something you type.
for c in $bash_cmds; do
  if [ "$c" = "help" ]; then
    continue
  fi
  case "$bash_usage" in
    *"$c"*) ;;
    *) echo "check-sim-parity: '$c' is a command but no usage string documents it" >&2
       fail=1 ;;
  esac
done

[ "$fail" = "0" ] && echo "check-sim-parity: both launchers offer the same $(echo "$bash_cmds" | wc -w | tr -d ' ') commands"
exit $fail
