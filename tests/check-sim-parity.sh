#!/usr/bin/env bash
# Both launchers must offer the same commands, document them the same way,
# and answer the same way when the argv is wrong.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

# The trailing `|| true` on each of these pipelines matters: under `set -o
# pipefail`, a `grep -oE` that matches nothing exits 1, which would abort the
# whole script right here — before the `[ -z ... ]` guard below ever runs —
# and leave whoever tripped it with a bare non-zero exit and no reason why.
# `sed -n '...p'` does not have this problem (it exits 0 on no match), which
# is why usage_body() below needs no such guard.
# `.gitattributes` forces sim.ps1 to CRLF on checkout (Windows editors need
# it), so a `$`-anchored pattern against a freshly-cloned sim.ps1 never
# matches -- the line ends in `)\r`, not `)`. Strip CR before any of these
# extractions run, on both files, so the anchors keep doing their job of
# catching real drift instead of false-failing on line-ending noise.
bash_cmds=$(tr -d '\r' < sim | sed -n '/^case "\$cmd" in/,/^esac/p' \
  | grep -oE '^  [a-z]+\)' | tr -d ' )' | sort -u || true)

if [ -z "$bash_cmds" ]; then
  echo "check-sim-parity: sim has no 'case \"\$cmd\" in ... esac' block to read commands from" >&2
  exit 1
fi

if [ ! -f sim.ps1 ]; then
  echo "check-sim-parity: sim.ps1 does not exist; the Windows launcher is missing" >&2
  exit 1
fi

ps_cmds=$(tr -d '\r' < sim.ps1 | grep -oE "^\\\$COMMANDS = @\(.*\)$" \
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

# $COMMANDS is only a declaration: the `switch` further down sim.ps1 is what
# actually runs. Declare a command in both launchers but forget its switch
# arm and `.\sim.ps1 newcmd` passes the $COMMANDS guard, matches no arm,
# prints nothing and exits 0 — while `./sim newcmd` runs. Same CRLF strip and
# same `|| true` reasoning as above.
ps_arms=$(tr -d '\r' < sim.ps1 | sed -n '/^switch -casesensitive (\$Command) {/,/^}/p' \
  | grep -oE "^  '[a-z]+'" | tr -d " '" | sort -u || true)

if [ -z "$ps_arms" ]; then
  echo "check-sim-parity: sim.ps1 has no 'switch -casesensitive (\$Command) { ... }' block to read arms from" >&2
  exit 1
fi

if [ "$ps_cmds" != "$ps_arms" ]; then
  echo "check-sim-parity: sim.ps1 declares commands it does not dispatch (or the reverse)." >&2
  echo "  declared in \$COMMANDS, no switch arm: $(comm -23 <(echo "$ps_cmds") <(echo "$ps_arms") | tr '\n' ' ')" >&2
  echo "  switch arm, not in \$COMMANDS:         $(comm -13 <(echo "$ps_cmds") <(echo "$ps_arms") | tr '\n' ' ')" >&2
  echo "  a declared command with no arm falls through the switch: no output, exit 0." >&2
  fail=1
fi

# Both case-sensitive operators are load-bearing and neither is observable
# from the outside on its own: the $COMMANDS guard already rejects `DOCTOR`,
# so dropping `-casesensitive` from the switch changes no behaviour today —
# it just re-arms the fall-through above for whoever next edits the guard.
# sim dispatches on a shell `case`, which is byte-exact and has no such knob.
if ! tr -d '\r' < sim.ps1 | grep -q '^if ($COMMANDS -cnotcontains $Command) {'; then
  echo "check-sim-parity: sim.ps1's command guard is not '\$COMMANDS -cnotcontains \$Command'" >&2
  echo "  -notcontains compares case-INSENSITIVELY: '.\\sim.ps1 DOCTOR' would pass the guard." >&2
  fail=1
fi
if ! tr -d '\r' < sim.ps1 | grep -q '^switch -casesensitive (\$Command) {'; then
  echo "check-sim-parity: sim.ps1's dispatch is not 'switch -casesensitive (\$Command)'" >&2
  echo "  a bare switch matches case-INSENSITIVELY, so the two guards stop being independent." >&2
  fail=1
fi

# The usage strings have to stay in step too. Compare only the {...} body: the
# prefix differs by design (./sim vs .\sim.ps1), the body must not.
usage_body() { tr -d '\r' < "$1" | sed -n 's/.*usage: [^ ]* \({[^}]*}\).*/\1/p' | sort -u; }

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
# The body is pipe-delimited, e.g. `{up [bank]|down|reset|...}`, so a real
# occurrence of a command sits right after `{` or `|` and right before a
# space, `|`, or the closing `}`. An unanchored substring match (the old
# `case "$bash_usage" in *"$c"*)`) would let a short command hiding inside
# a longer token — e.g. a future `at` inside `status` — pass as "documented"
# when it isn't; this regex requires both boundaries.
for c in $bash_cmds; do
  if [ "$c" = "help" ]; then
    continue
  fi
  if ! printf '%s' "$bash_usage" | grep -qE "[{|]$c([ |}])"; then
    echo "check-sim-parity: '$c' is a command but no usage string documents it" >&2
    fail=1
  fi
done

# ---------------------------------------------------------------------------
# Behaviour, not declaration: same argv in, same exit code out.
# ---------------------------------------------------------------------------
psh=""
for candidate in pwsh powershell; do
  if command -v "$candidate" >/dev/null 2>&1; then psh="$candidate"; break; fi
done

if [ -z "$psh" ]; then
  if [ -n "${PWSH_REQUIRED:-}" ]; then
    echo "check-sim-parity: PWSH_REQUIRED is set and neither pwsh nor powershell is on PATH" >&2
    exit 1
  fi
  echo "check-sim-parity: no pwsh/powershell on PATH — the exit-code comparison was SKIPPED." >&2
  echo "                  CI sets PWSH_REQUIRED and will not skip it." >&2
  echo "                  Install it: brew install powershell | https://aka.ms/powershell" >&2
  [ "$fail" = "0" ] && echo "check-sim-parity: $(echo "$bash_cmds" | wc -w | tr -d ' ') commands declared, dispatched and documented alike — behaviour NOT compared, see above"
  exit $fail
fi

# `./sim purge --all` deletes every attempt ever graded on this machine, with
# no backup and no undo, and up/down/reset/purge all reach docker on their
# first line. So every launcher below runs with a stub `docker`, `curl`,
# `python3` and `git` earlier on PATH than the real ones: the stub appends the
# command line it was handed to $marker and exits 97. Nothing in the argv
# table may ever reach it — a non-empty marker means the table gained a case
# that runs the real thing, and this gate stops rather than let CI (or a
# contributor with a live exam running) find out the hard way.
stub=$(mktemp -d)
trap 'rm -rf "$stub"' EXIT
marker="$stub/reached"
: > "$marker"
cat > "$stub/_stub" <<'STUB'
#!/bin/sh
printf '%s %s\n' "$(basename "$0")" "$*" >> "$SIM_PARITY_MARKER"
exit 97
STUB
chmod +x "$stub/_stub"
for tool in docker curl python3 git; do
  cp "$stub/_stub" "$stub/$tool"
done
rm -f "$stub/_stub"

run_launcher() {
  local which_one=$1
  shift
  : > "$marker"
  if [ "$which_one" = "bash" ]; then
    out=$(PATH="$stub:$PATH" SIM_PARITY_MARKER="$marker" bash ./sim "$@" 2>&1 </dev/null) && code=0 || code=$?
  else
    out=$(PATH="$stub:$PATH" SIM_PARITY_MARKER="$marker" "$psh" -NoProfile -File ./sim.ps1 "$@" 2>&1 </dev/null) && code=0 || code=$?
  fi
  reached=$(cat "$marker")
}

# An empty marker only proves anything if the stub is capable of catching a
# call in the first place. `status` is `docker compose ps` on both launchers
# and mutates nothing even in the worst case where the shadowing failed and
# the real docker ran — so it is the one command safe to use as the positive
# control that the rest of this section rests on.
out=""; code=0; reached=""
for which_one in bash pwsh; do
  run_launcher "$which_one" status
  if [ -z "$reached" ] || [ "$code" != "97" ]; then
    echo "check-sim-parity: the stub PATH is not shadowing docker for the $which_one launcher" >&2
    echo "  '$which_one status' exited $code and the stub recorded: ${reached:-<nothing>}" >&2
    echo "  refusing to run the argv table — it would be comparing exit codes with docker live." >&2
    exit 1
  fi
done

# Every row is argv that both launchers must refuse *before* they reach
# docker. up/down/reset/doctor/ssh/grade and a bare `purge` are absent
# because they do reach it; `purge --all` is absent because it is the
# destructive one this whole stub exists to keep out of the table.
# Columns: expected exit code, then argv. %EMPTY% is a single empty argument
# (a wrapper passing "$cmd" with $cmd unset), which cannot be written as a
# bare token here.
#
# A dash-leading FIRST token (`--all` with no command at all) is deliberately
# absent: PowerShell's binder swallows it — and the token after it — into
# $args before $Command is considered, so `.\sim.ps1 --all` runs `help` and
# exits 0 where `./sim --all` prints usage and exits 1. Real divergence,
# tracked separately; it is not something this table can assert today.
cases=0
while IFS= read -r row; do
  case "$row" in ''|'#'*) continue ;; esac
  read -r -a fields <<< "$row"
  want=${fields[0]}
  argv=("${fields[@]:1}")
  if [ "${argv[0]:-}" = "%EMPTY%" ]; then
    argv=("")
  fi
  label=${row#"$want"}
  label=${label# }
  [ -n "$label" ] || label="<no arguments>"

  # `${argv[@]+"${argv[@]}"}`, not a bare `"${argv[@]}"`: macOS ships bash
  # 3.2, where expanding an empty array under `set -u` is an unbound-variable
  # error, and the very first row of the table is the no-arguments one.
  run_launcher bash ${argv[@]+"${argv[@]}"}
  bash_code=$code
  bash_out=$out
  bash_reached=$reached
  run_launcher pwsh ${argv[@]+"${argv[@]}"}
  ps_code=$code
  ps_out=$out
  ps_reached=$reached

  if [ -n "$bash_reached" ] || [ -n "$ps_reached" ]; then
    echo "check-sim-parity: '$label' REACHED docker. Nothing actually ran — the stub caught it." >&2
    echo "  sim:     ${bash_reached:-<nothing>}" >&2
    echo "  sim.ps1: ${ps_reached:-<nothing>}" >&2
    echo "  Either a launcher now RUNS argv it used to refuse — which is the bug, and is" >&2
    echo "  exactly what 'purge --ALL' did before c52eed6 — or this row does not belong in" >&2
    echo "  a table that may only hold argv both launchers refuse before touching docker." >&2
    exit 1
  fi

  if [ "$bash_code" != "$ps_code" ]; then
    echo "check-sim-parity: the launchers disagree on '$label'." >&2
    echo "  sim exited $bash_code:     ${bash_out:-<no output>}" >&2
    echo "  sim.ps1 exited $ps_code:   ${ps_out:-<no output>}" >&2
    fail=1
  elif [ "$bash_code" != "$want" ]; then
    echo "check-sim-parity: both launchers exited $bash_code for '$label', expected $want." >&2
    fail=1
  fi

  # A command that matches no dispatch arm exits 0 with nothing on either
  # stream. Requiring output on the refusal rows catches that even if some
  # future edit makes the exit codes agree by accident.
  if [ "$want" != "0" ]; then
    [ -n "$bash_out" ] || { echo "check-sim-parity: sim printed nothing for '$label' — a refusal has to say so" >&2; fail=1; }
    [ -n "$ps_out" ] || { echo "check-sim-parity: sim.ps1 printed nothing for '$label' — a refusal has to say so" >&2; fail=1; }
  fi

  cases=$((cases + 1))
done <<'TABLE'
0
0 help
0 %EMPTY%
1 bogus
1 upp
1 Help
1 UP
1 Down
1 RESET
1 Purge
1 DOCTOR
1 Ssh
1 STATUS
1 Grade
1 purge --ALL
1 purge --All
1 purge --aLL
1 purge -all
1 purge --all-of-it
1 purge nonsense
TABLE

if [ "$cases" -lt 10 ]; then
  echo "check-sim-parity: only $cases argv cases ran — the table did not survive being read" >&2
  exit 1
fi

[ "$fail" = "0" ] && echo "check-sim-parity: $(echo "$bash_cmds" | wc -w | tr -d ' ') commands declared, dispatched and documented alike; $cases argv cases agree on exit code, none reached docker"
exit $fail
