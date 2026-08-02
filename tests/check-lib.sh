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

# --- show_*: the artifact wire shape -----------------------------------
#
# The grader parses this byte for byte
# (facilitator/internal/evaluate/artifact.go). A sentinel that drifts by
# one character is not an error anywhere at runtime — the block is simply
# discarded and the candidate is back to a bare message — so the exact
# spelling is asserted here or nowhere.
ok "show_actual"   "$(show_actual yaml 'kind: Service')"  "$(printf -- '---8<--- sim:artifact actual yaml\nkind: Service')"
ok "show_why"      "$(show_why 'The selector matches no Pod.')" "$(printf -- '---8<--- sim:artifact why text\nThe selector matches no Pod.')"
# Multi-line bodies keep their newlines and nothing is indented: the
# sentinel is only recognised at column 0, and so is the next one.
ok "show_actual multiline" "$(show_actual yaml "$(printf 'a: 1\nb: 2')")" \
   "$(printf -- '---8<--- sim:artifact actual yaml\na: 1\nb: 2')"
# An empty pane says less than no pane, so an empty body emits nothing.
ok "show_actual empty body" "$(show_actual yaml '')" ""
succeeds "show_actual empty body succeeds" show_actual yaml ''
# A body is data, not a format string. `%s` in a ConfigMap value used to
# be the kind of thing that turned a check's evidence into garbage.
ok "show_why printf-safe" "$(show_why 'literal %s and \n stay put')" \
   "$(printf -- '---8<--- sim:artifact why text\nliteral %%s and \\n stay put')"

printf 'kind: Service\nspec:\n  selector:\n    app: inventory\n' > "$tmp/expected.yaml"
ok "show_expected reads the file" "$(show_expected yaml "$tmp/expected.yaml")" \
   "$(printf -- '---8<--- sim:artifact expected yaml\nkind: Service\nspec:\n  selector:\n    app: inventory')"
# A question that has not been given an expected document degrades to the
# message it always had, never to a broken check.
ok "show_expected missing file" "$(show_expected yaml "$tmp/nope.yaml")" ""
succeeds "show_expected missing file succeeds" show_expected yaml "$tmp/nope.yaml"

# --- k8s_clean ---------------------------------------------------------
#
# yq is on the instances (images/instance/Dockerfile), which is where
# checks run, but it is not a declared dependency of this gate's host —
# so this block skips rather than failing a machine that is fine.
if command -v yq >/dev/null 2>&1; then
  printf '%s\n' \
    'apiVersion: v1' \
    'kind: Service' \
    'metadata:' \
    '  annotations:' \
    '    kubectl.kubernetes.io/last-applied-configuration: "{}"' \
    '  creationTimestamp: "2026-01-01T00:00:00Z"' \
    '  generation: 3' \
    '  managedFields: [{manager: kubectl}]' \
    '  name: inventory' \
    '  resourceVersion: "12345"' \
    '  uid: aaaa-bbbb' \
    'spec:' \
    '  selector: {app: inventory}' \
    'status:' \
    '  loadBalancer: {}' > "$tmp/live.yaml"
  cleaned=$(k8s_clean < "$tmp/live.yaml")
  for noise in managedFields creationTimestamp resourceVersion uid generation status last-applied-configuration; do
    case "$cleaned" in
      *"$noise"*) echo "FAIL: k8s_clean left '$noise' behind"; FAIL=$((FAIL+1)) ;;
      *)          PASS=$((PASS+1)) ;;
    esac
  done
  # It strips the noise and nothing else — an object with its identity
  # removed is not evidence of anything.
  ok "k8s_clean keeps the object" "$cleaned" \
     "$(printf 'apiVersion: v1\nkind: Service\nmetadata:\n  name: inventory\nspec:\n  selector: {app: inventory}')"
  # `kubectl get pods -o yaml` (no name) is a List, and the noise is one
  # level down. Cleaning only the outer document would have left every
  # item's managedFields in place, which is most of the bytes.
  printf '%s\n' \
    'apiVersion: v1' \
    'kind: List' \
    'items:' \
    '- kind: Pod' \
    '  metadata:' \
    '    managedFields: [{manager: kubelet}]' \
    '    name: p1' \
    '  status: {phase: Running}' > "$tmp/list.yaml"
  case "$(k8s_clean < "$tmp/list.yaml")" in
    *managedFields*|*phase*) echo "FAIL: k8s_clean did not descend into a List's items"; FAIL=$((FAIL+1)) ;;
    *)                       PASS=$((PASS+1)) ;;
  esac
  # Not-YAML in, nothing out. Passing the raw text through instead would
  # put a wall of managedFields on the explanation screen, which is worse
  # evidence than none.
  ok "k8s_clean rejects garbage" "$(printf 'not: [valid\n' | k8s_clean)" ""
else
  echo "note: yq not installed — skipped the k8s_clean cases"
fi

rm -rf "$tmp"
echo
echo "check-lib: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
