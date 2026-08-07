#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
. banks/_lib/checks.sh

PASS=0
FAIL=0

ok() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1));
  else echo "FAIL: $1 — got '$2', want '$3'"; FAIL=$((FAIL+1)); fi
}
succeeds() { local d=$1; shift; if "$@"; then PASS=$((PASS+1)); else echo "FAIL: $d — expected success"; FAIL=$((FAIL+1)); fi; }
fails()    { local d=$1; shift; if "$@"; then echo "FAIL: $d — expected failure"; FAIL=$((FAIL+1)); else PASS=$((PASS+1)); fi; }

ok "milli 100m"  "$(milli 100m)"  "100"
ok "milli 0.1"   "$(milli 0.1)"   "100"
ok "milli 1"     "$(milli 1)"     "1000"
ok "milli 1.5"   "$(milli 1.5)"   "1500"
ok "milli empty" "$(milli '')"    ""
ok "milli 0.1 == milli 100m" "$(milli 0.1)" "$(milli 100m)"

ok "mib 64Mi"    "$(mib 64Mi)"    "64"
ok "mib 1Gi"     "$(mib 1Gi)"     "1024"
ok "mib 2048Ki"  "$(mib 2048Ki)"  "2"
ok "mib empty"   "$(mib '')"      ""
ok "mib bytes"   "$(mib 1000000)" "x"

ok "mode 0400"   "$(mode_decimal 0400)" "256"
ok "mode 0644"   "$(mode_decimal 0644)" "420"
ok "mode 400"    "$(mode_decimal 400)"  "256"

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

printf 'beta\nalpha\n\ngamma  \n' > "$tmp/list"
ok "file_lines_sorted" "$(file_lines_sorted "$tmp/list" | tr '\n' ' ')" "alpha beta gamma "
succeeds "same_set ignores order"      same_set "$(printf 'a\nb')" "$(printf 'b\na')"
succeeds "same_set ignores blank lines" same_set "$(printf 'a\n\nb')" "$(printf 'b\na')"
fails    "same_set catches a missing member" same_set "$(printf 'a\nb')" "a"
fails    "same_set catches an extra member"  same_set "a" "$(printf 'a\nb')"

succeeds "contains_kv spaced"   contains_kv 'max_connections = 512' max_connections 512
succeeds "contains_kv tight"    contains_kv 'max_connections=512'   max_connections 512
succeeds "contains_kv indented" contains_kv '   max_connections =512 ' max_connections 512
succeeds "contains_kv multiline" contains_kv "$(printf '# a comment\nmax_connections=512\nother=1')" max_connections 512
fails    "contains_kv wrong value" contains_kv 'max_connections = 128' max_connections 512
fails    "contains_kv absent"      contains_kv 'something_else = 512' max_connections 512
fails    "contains_kv no partial key" contains_kv 'my_max_connections=512' max_connections 512

succeeds "contains_pair single space" contains_pair "$(printf 'cpu 42\nmem 71')" cpu 42
succeeds "contains_pair double space" contains_pair "$(printf 'cpu  42\nmem 71')" cpu 42
succeeds "contains_pair tab"          contains_pair "$(printf 'cpu\t42')" cpu 42
fails    "contains_pair wrong value"  contains_pair "$(printf 'cpu 43')" cpu 42
fails    "contains_pair no partial"   contains_pair "$(printf 'vcpu 42')" cpu 42

succeeds "semver_ge equal"   semver_ge 1.2.0 1.2.0
succeeds "semver_ge greater" semver_ge 1.10.0 1.9.0
fails    "semver_ge lesser"  semver_ge 1.9.0 1.10.0

# has_name matches one whole token out of a jsonpath list. grep -w cannot do
# this job: a hyphen is not a word character, so -w 'agent' matches
# 'vault-agent' and -w 'app-tuning' matches 'my-app-tuning' — the second of
# those scores a wrong answer as correct.
succeeds "has_name single"        has_name 'agent' agent
succeeds "has_name among many"    has_name 'app adapter' adapter
succeeds "has_name newline list"  has_name "$(printf 'app\nadapter')" adapter
succeeds "has_name tab list"      has_name "$(printf 'app\tadapter')" adapter
fails    "has_name hyphen suffix" has_name 'vault-agent' agent
fails    "has_name hyphen prefix" has_name 'agent-sidecar' agent
fails    "has_name substring"     has_name 'my-app-tuning' app-tuning
fails    "has_name empty list"    has_name '' agent
fails    "has_name absent"        has_name 'web db' agent
succeeds "has_name exact hyphen"  has_name 'vault-agent' vault-agent
succeeds "has_name slash"         has_name 'batch/v1 networking.k8s.io/v1' batch/v1
fails    "has_name slash partial" has_name 'batch/v1beta1' batch/v1

# name_list renders what IS there when a lookup by name found nothing, so the
# message can say "found: vault-agent" instead of reporting an empty field.
ok "name_list one"    "$(name_list 'vault-agent')"        "vault-agent"
ok "name_list many"   "$(name_list 'app adapter')"        "app, adapter"
ok "name_list tabs"   "$(name_list "$(printf 'a\tb')")"   "a, b"
ok "name_list spaced" "$(name_list '  app   adapter  ')"  "app, adapter"
ok "name_list empty"  "$(name_list '')"                   "none"
ok "name_list blank"  "$(name_list '   ')"                "none"

ok "show_actual"   "$(show_actual yaml 'kind: Service')"  "$(printf -- '---8<--- sim:artifact actual yaml\nkind: Service')"
ok "show_why"      "$(show_why 'The selector matches no Pod.')" "$(printf -- '---8<--- sim:artifact why text\nThe selector matches no Pod.')"
ok "show_actual multiline" "$(show_actual yaml "$(printf 'a: 1\nb: 2')")" \
   "$(printf -- '---8<--- sim:artifact actual yaml\na: 1\nb: 2')"
# An empty body is the case the candidate most needs to see: the object or the
# named container is not there at all. Emitting nothing left them reading
# "runAsUser='', want 10001" with no pane to explain it, so empty must still
# produce an artifact.
ok "show_actual empty body" "$(show_actual yaml '')" \
   "$(printf -- '---8<--- sim:artifact actual text\n%s' "$ARTIFACT_EMPTY")"
succeeds "show_actual empty body succeeds" eval "show_actual yaml '' >/dev/null"
ok "show_actual whitespace body" "$(show_actual yaml '   ')" \
   "$(printf -- '---8<--- sim:artifact actual text\n%s' "$ARTIFACT_EMPTY")"
ok "show_actual jq null body" "$(show_actual json 'null')" \
   "$(printf -- '---8<--- sim:artifact actual text\n%s' "$ARTIFACT_EMPTY")"
ok "show_why printf-safe" "$(show_why 'literal %s and \n stay put')" \
   "$(printf -- '---8<--- sim:artifact why text\nliteral %%s and \\n stay put')"

# --- scored criteria ---------------------------------------------------------
# crit prints the detail immediately, so it lands in the message ahead of any
# evidence pane; report emits the tally last and decides the exit status.
crit_run() ( # subshell: the accumulators are globals
  _CRIT_EARNED=0; _CRIT_TOTAL=0; _CRIT_LINES=''
  "$@"
  report
)

two_of_three() {
  crit 1 "uid is 10001"   "runAsUser='', want 10001"   -- [ 1 = 1 ]
  crit 1 "gid is 20001"   "runAsGroup='', want 20001"  -- [ 1 = 1 ]
  crit 1 "refuses root"   "runAsNonRoot='', want true" -- [ 1 = 2 ]
}
out=$(crit_run two_of_three)
rc=$?
ok "crit failing detail is in the message" "$(printf '%s' "$out" | head -1)" "runAsNonRoot='', want true"
ok "crit emits one line per criterion" "$(printf '%s' "$out" | grep -c 'sim:criterion')" "3"
ok "crit marks the passes"  "$(printf '%s' "$out" | grep -c 'sim:criterion pass 1 ')" "2"
ok "crit marks the failure" "$(printf '%s' "$out" | grep -c 'sim:criterion fail 1 refuses root')" "1"
ok "report exits non-zero when a criterion failed" "$rc" "1"
# A passing criterion must not leak its detail into the message.
case $out in
  *"want 10001"*) bad=1 ;;
  *) bad=0 ;;
esac
ok "crit stays quiet about passes" "$bad" "0"

all_three() {
  crit 2 "uid is 10001" "no" -- [ 1 = 1 ]
  crit 1 "refuses root" "no" -- true
}
out=$(crit_run all_three)
rc=$?
ok "report exits zero when every criterion passed" "$rc" "0"
ok "clean run emits no message" "$(printf '%s' "$out" | grep -vc 'sim:criterion')" "0"
ok "weights are carried through" "$(printf '%s' "$out" | grep -c 'sim:criterion pass 2 uid is 10001')" "1"

# -- is what tells an optional note apart from the test command, so a missing one
# must be loud. Silently guessing would grade something other than the answer.
no_dashes() { crit 1 "plain" "no" [ 1 = 1 ]; }
out=$(crit_run no_dashes 2>/dev/null)
ok "crit without -- scores nothing" "$(printf '%s' "$out" | grep -c 'sim:criterion pass')" "0"
ok "crit without -- fails the criterion" "$(printf '%s' "$out" | grep -c 'sim:criterion fail 1 plain')" "1"
ok "crit without -- says so on stderr" \
   "$(crit_run no_dashes 2>&1 >/dev/null | grep -c 'needs -- before the test')" "1"

# Per-criterion notes: crit_why hands back the FIRST failure's, because that is
# the one the candidate has to read. A passing criterion's note stays unused.
with_whys() {
  crit 1 "first"  "m1" "note for first"  -- true
  crit 1 "second" "m2" "note for second" -- false
  crit 1 "third"  "m3" "note for third"  -- false
}
out=$(crit_run with_whys)
ok "crit_why is the first failure's note" "$(_CRIT_WHY=''; crit 1 a m 'note for second' -- false >/dev/null; crit_why)" "note for second"
ok "notes stay out of the output" "$(printf '%s' "$out" | grep -c 'note for')" "0"
ok "a criterion with a note still scores" "$(printf '%s' "$out" | grep -c 'sim:criterion pass 1 first')" "1"
ok "a note does not become the test" "$(printf '%s' "$out" | grep -c 'sim:criterion fail 1 second')" "1"

# `!` is a keyword, so `-- ! cmd` would hunt for a binary named '!', fail, and
# score the criterion backwards. negate() is the way to express a negative, and
# is not called "not" because that word appears in 160 places in the prose the
# unsourced-helper lint scans.
succeeds "negate inverts a failure" negate false
fails    "negate inverts a success" negate true
ok "crit with negate scores a denial as a pass" \
   "$(_CRIT_EARNED=0; _CRIT_TOTAL=0; _CRIT_LINES=''; crit 1 "denied" "got through" -- negate false; printf '%s' "$_CRIT_LINES" | grep -c 'pass 1 denied')" "1"
ok "crit with negate scores a success as a failure" \
   "$(_CRIT_EARNED=0; _CRIT_TOTAL=0; _CRIT_LINES=''; crit 1 "denied" "got through" -- negate true >/dev/null; printf '%s' "$_CRIT_LINES" | grep -c 'fail 1 denied')" "1"
_CRIT_EARNED=0; _CRIT_TOTAL=0; _CRIT_LINES=''; _CRIT_WHY=''

succeeds "crit returns the test's status on pass" eval "crit 1 d m w -- true >/dev/null"
fails    "crit returns the test's status on fail" eval "crit 1 d m w -- false >/dev/null"
_CRIT_EARNED=0; _CRIT_TOTAL=0; _CRIT_LINES=''; _CRIT_WHY=''

printf 'kind: Service\nspec:\n  selector:\n    app: inventory\n' > "$tmp/expected.yaml"
ok "show_expected reads the file" "$(show_expected yaml "$tmp/expected.yaml")" \
   "$(printf -- '---8<--- sim:artifact expected yaml\nkind: Service\nspec:\n  selector:\n    app: inventory')"
ok "show_expected missing file" "$(show_expected yaml "$tmp/nope.yaml")" ""
succeeds "show_expected missing file succeeds" show_expected yaml "$tmp/nope.yaml"

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

  ok "k8s_clean keeps the object" "$cleaned" \
     "$(printf 'apiVersion: v1\nkind: Service\nmetadata:\n  name: inventory\nspec:\n  selector: {app: inventory}')"

  ok "k8s_clean drops an allocated clusterIP" \
     "$(printf 'apiVersion: v1\nkind: Service\nspec:\n  clusterIP: 10.96.248.74\n  clusterIPs: [10.96.248.74]\n  selector: {app: inventory}\n' | k8s_clean)" \
     "$(printf 'apiVersion: v1\nkind: Service\nspec:\n  selector: {app: inventory}')"

  ok "k8s_clean keeps a headless clusterIP" \
     "$(printf 'apiVersion: v1\nkind: Service\nspec:\n  clusterIP: None\n  clusterIPs: [None]\n  selector: {app: db}\n' | k8s_clean)" \
     "$(printf 'apiVersion: v1\nkind: Service\nspec:\n  clusterIP: None\n  clusterIPs: [None]\n  selector: {app: db}')"

  ok "k8s_clean drops the Service defaults" \
     "$(printf 'apiVersion: v1\nkind: Service\nspec:\n  internalTrafficPolicy: Cluster\n  externalTrafficPolicy: Cluster\n  sessionAffinity: None\n  ipFamilyPolicy: SingleStack\n  ipFamilies: [IPv4]\n  type: NodePort\n' | k8s_clean)" \
     "$(printf 'apiVersion: v1\nkind: Service\nspec:\n  type: NodePort')"

  ok "k8s_clean keeps authored Service policies" \
     "$(printf 'apiVersion: v1\nkind: Service\nspec:\n  internalTrafficPolicy: Local\n  externalTrafficPolicy: Local\n  sessionAffinity: ClientIP\n  ipFamilyPolicy: RequireDualStack\n  ipFamilies: [IPv4, IPv6]\n' | k8s_clean)" \
     "$(printf 'apiVersion: v1\nkind: Service\nspec:\n  internalTrafficPolicy: Local\n  externalTrafficPolicy: Local\n  sessionAffinity: ClientIP\n  ipFamilyPolicy: RequireDualStack\n  ipFamilies: [IPv4, IPv6]')"

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

  ok "k8s_clean rejects garbage" "$(printf 'not: [valid\n' | k8s_clean)" ""
else
  echo "note: yq not installed — skipped the k8s_clean cases"
fi

rm -rf "$tmp"
echo
echo "check-lib: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
