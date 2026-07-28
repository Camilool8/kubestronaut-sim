#!/usr/bin/env bash
# Unit tests for banks/_lib/checks.sh.
#
# These helpers decide whether a correct answer scores. Every one of them
# exists because a check was failing answers that were right, so the
# cases below are mostly the specific spellings that used to lose points:
# a trailing space in an answer file, `100m` written as `0.1`,
# `max_connections=512` without the spaces the seeded file happened to
# have. Offline, no cluster, runs in milliseconds — the opposite of
# smoke.sh, which is the only other thing that ever executes a check.
set -uo pipefail
cd "$(dirname "$0")/.."
. banks/_lib/checks.sh

PASS=0
FAIL=0

# ok <description> <actual> <expected>
ok() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1));
  else echo "FAIL: $1 — got '$2', want '$3'"; FAIL=$((FAIL+1)); fi
}
# succeeds/fails <description> <command...>
succeeds() { local d=$1; shift; if "$@"; then PASS=$((PASS+1)); else echo "FAIL: $d — expected success"; FAIL=$((FAIL+1)); fi; }
fails()    { local d=$1; shift; if "$@"; then echo "FAIL: $d — expected failure"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi; }

# --- milli: CPU quantities compared by value, not spelling -------------
ok "milli 100m"  "$(milli 100m)"  "100"
ok "milli 0.1"   "$(milli 0.1)"   "100"
ok "milli 1"     "$(milli 1)"     "1000"
ok "milli 1.5"   "$(milli 1.5)"   "1500"
ok "milli empty" "$(milli '')"    ""
# The pair that made this necessary: both are the same request.
ok "milli 0.1 == milli 100m" "$(milli 0.1)" "$(milli 100m)"

# --- mib: memory likewise ----------------------------------------------
ok "mib 64Mi"    "$(mib 64Mi)"    "64"
ok "mib 1Gi"     "$(mib 1Gi)"     "1024"
ok "mib 2048Ki"  "$(mib 2048Ki)"  "2"
ok "mib empty"   "$(mib '')"      ""
# An unhandled unit must fail loudly, never silently compare equal.
ok "mib bytes"   "$(mib 1000000)" "x"

# --- mode_decimal: octal in the manifest, decimal in the API -----------
ok "mode 0400"   "$(mode_decimal 0400)" "256"
ok "mode 0644"   "$(mode_decimal 0644)" "420"
ok "mode 400"    "$(mode_decimal 400)"  "256"

# --- file_text: answer files a human typed -----------------------------
tmp=$(mktemp -d)
printf 'nginx:1.99\n'      > "$tmp/plain"
printf 'nginx:1.99  \n'    > "$tmp/trailing"
printf '  nginx:1.99\n'    > "$tmp/leading"
printf 'nginx:1.99\r\n'    > "$tmp/crlf"
printf 'nginx:1.99'        > "$tmp/nonewline"
ok "file_text plain"      "$(file_text "$tmp/plain")"      "nginx:1.99"
ok "file_text trailing"   "$(file_text "$tmp/trailing")"   "nginx:1.99"
ok "file_text leading"    "$(file_text "$tmp/leading")"    "nginx:1.99"
ok "file_text crlf"       "$(file_text "$tmp/crlf")"       "nginx:1.99"
ok "file_text no newline" "$(file_text "$tmp/nonewline")"  "nginx:1.99"
ok "file_text missing"    "$(file_text "$tmp/nope")"       ""

# --- file_lines_sorted + same_set: list answers ------------------------
printf 'beta\nalpha\n\ngamma  \n' > "$tmp/list"
ok "file_lines_sorted" "$(file_lines_sorted "$tmp/list" | tr '\n' ' ')" "alpha beta gamma "
succeeds "same_set ignores order"      same_set "$(printf 'a\nb')" "$(printf 'b\na')"
succeeds "same_set ignores blank lines" same_set "$(printf 'a\n\nb')" "$(printf 'b\na')"
fails    "same_set catches a missing member" same_set "$(printf 'a\nb')" "a"
fails    "same_set catches an extra member"  same_set "a" "$(printf 'a\nb')"

# --- contains_kv: key=value with any spacing ---------------------------
succeeds "contains_kv spaced"   contains_kv 'max_connections = 512' max_connections 512
succeeds "contains_kv tight"    contains_kv 'max_connections=512'   max_connections 512
succeeds "contains_kv indented" contains_kv '   max_connections =512 ' max_connections 512
succeeds "contains_kv multiline" contains_kv "$(printf '# a comment\nmax_connections=512\nother=1')" max_connections 512
fails    "contains_kv wrong value" contains_kv 'max_connections = 128' max_connections 512
fails    "contains_kv absent"      contains_kv 'something_else = 512' max_connections 512
# Must not match a longer key that merely ends with the one asked for.
fails    "contains_kv no partial key" contains_kv 'my_max_connections=512' max_connections 512

# --- contains_pair: whitespace-separated output ------------------------
succeeds "contains_pair single space" contains_pair "$(printf 'cpu 42\nmem 71')" cpu 42
succeeds "contains_pair double space" contains_pair "$(printf 'cpu  42\nmem 71')" cpu 42
succeeds "contains_pair tab"          contains_pair "$(printf 'cpu\t42')" cpu 42
fails    "contains_pair wrong value"  contains_pair "$(printf 'cpu 43')" cpu 42
fails    "contains_pair no partial"   contains_pair "$(printf 'vcpu 42')" cpu 42

# --- semver_ge ---------------------------------------------------------
succeeds "semver_ge equal"   semver_ge 1.2.0 1.2.0
succeeds "semver_ge greater" semver_ge 1.10.0 1.9.0
fails    "semver_ge lesser"  semver_ge 1.9.0 1.10.0

rm -rf "$tmp"
echo
echo "check-lib: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
