#!/usr/bin/env bash
# Drives real validate scripts against a stubbed kubectl to prove what a FAILING
# check reports. tests/solutions/ only ever walks the happy path, which is how a
# check came to answer "runAsUser='', want 10001" — with the pane that would have
# named the real cause silently dropped — for a whole release.
#
# Two properties per case:
#   1. a failure never arrives without an `actual` pane
#   2. a name the candidate did not use is reported as that, not as an empty field
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
root=$PWD
. banks/_lib/checks.sh   # for ARTIFACT_EMPTY

# The stub keys its canned jsonpath answers by the flattened path. Derive the
# key here the same way rather than hand-spelling it, so a fixture cannot go
# quietly unused and make a check look like it passed on an empty answer.
jsonpath_key() { printf '%s' "$1" | tr -c 'a-zA-Z0-9' '_'; }
fixture() { mkdir -p "$1/jsonpath"; }
canned() { # fixture-dir, jsonpath, value
  mkdir -p "$1/jsonpath"
  printf '%s' "$3" > "$1/jsonpath/$(jsonpath_key "$2")"
}

PASS=0
FAIL=0
note() { PASS=$((PASS+1)); }
bad() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# A validate script sources /banks/_lib/checks.sh by absolute path, which is
# where it lives inside the instance container. Run a copy that sources the tree
# under test instead.
run_check() {
  local script=$1 fixture=$2 bank
  # BANK is what a check joins to reach its own expected/ files, so it comes
  # from the script's own path. Hard-coding one bank made every other bank's
  # checks read a directory belonging to ckad-mock-01.
  bank=$(printf '%s' "$script" | awk -F/ '$1 == "banks" {print $2}')
  sed "s#^\. /banks/_lib/checks\.sh#. $root/banks/_lib/checks.sh#; s#\"/banks/#\"$root/banks/#g" "$script" > "$tmp/chk.sh"
  PATH="$fixture:$PATH" BANK="${bank:-ckad-mock-01}" SIM_CHECK_PATH="$script" bash "$tmp/chk.sh" 2>&1
}

# A kubectl that answers from files named after the flag it was asked for, so a
# fixture only has to describe the two shapes a check reads: -o json and
# -o jsonpath.
make_kubectl() {
  local dir=$1
  mkdir -p "$dir"
  cat > "$dir/kubectl" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do
  case $a in
    -o) want=next ;;
    *)  if [ "${want:-}" = next ]; then
          case $a in
            json)        cat "$FIXTURE/json" 2>/dev/null; exit 0 ;;
            jsonpath=*)  path=${a#jsonpath=}
                         key=$(printf '%s' "$path" | tr -c 'a-zA-Z0-9' '_')
                         if [ -f "$FIXTURE/jsonpath/$key" ]; then
                           cat "$FIXTURE/jsonpath/$key"
                         fi
                         exit 0 ;;
          esac
          want=
        fi ;;
  esac
done
exit 0
STUB
  chmod +x "$dir/kubectl"

  # A grader reads the API and nothing else, with exactly one documented
  # exception: the CKA bank's etcd question asks the aux-etcd node whether a
  # file is a valid etcd snapshot. It dials the node directly —
  # `ssh -i /shared/ssh/id_ed25519 -p 2214 root@k8s-env 'etcdutl …'` — and not
  # by the `cka-aux-etcd` alias a candidate would type, because a check runs as
  # ROOT on the instance and that alias lives in ~candidate/.ssh/config.
  # Unstubbed, that line would try to reach a node from whatever machine runs
  # this gate — a DNS lookup and a connect timeout per check at best, someone's
  # real ssh agent and known_hosts at worst. So ssh is shadowed here for every
  # fixture, answers only from the fixture, and never touches a network.
  # Give it a canned answer by writing "$FIXTURE/ssh"; with no fixture file it
  # answers with nothing, which is the shape a check has to survive anyway.
  cat > "$dir/ssh" <<'STUB'
#!/usr/bin/env bash
if [ -n "${FIXTURE:-}" ] && [ -f "$FIXTURE/ssh" ]; then
  cat "$FIXTURE/ssh"
fi
exit 0
STUB
  chmod +x "$dir/ssh"
  # jq is real; only kubectl and ssh are stubbed.
}

# ---------------------------------------------------------------- q07 identity

q07=$tmp/q07
make_kubectl "$q07/bin"

# Case 1: the container carries every requested setting but under the Pod's own
# name. This is the exact shape that scored 1/9 on a real attempt.
fixture "$q07/misnamed"
cat > "$q07/misnamed/json" <<'JSON'
{"spec":{"securityContext":{},
 "containers":[{"name":"vault-agent",
  "securityContext":{"runAsUser":10001,"runAsGroup":20001,
    "allowPrivilegeEscalation":false,"readOnlyRootFilesystem":true,
    "capabilities":{"drop":["ALL"]}},
  "resources":{"requests":{"cpu":"100m","memory":"64Mi"},
               "limits":{"cpu":"500m","memory":"128Mi"}}}]}}
JSON
canned "$q07/misnamed" '{.spec.containers[*].name}' 'vault-agent'

out=$(FIXTURE=$q07/misnamed run_check banks/ckad-mock-01/q07/validate.d/10_identity.sh "$q07/bin")

case $out in
  *"no container named 'agent'"*) note ;;
  *) bad "q07 misnamed container: message does not name the container. got: $(printf '%s' "$out" | head -1)" ;;
esac
case $out in
  *"found: vault-agent"*) note ;;
  *) bad "q07 misnamed container: message does not report the name that exists" ;;
esac
case $out in
  *'sim:artifact actual'*) note ;;
  *) bad "q07 misnamed container: no actual pane — this is the regression" ;;
esac
case $out in
  *'"containers that exist"'*) note ;;
  *) bad "q07 misnamed container: actual pane does not list the real containers" ;;
esac
# The old message blamed the field. It must not be what the candidate reads now.
case $out in
  "runAsUser=''"*) bad "q07 misnamed container: still leads with the empty field" ;;
  *) note ;;
esac

# Case 2: correctly named and complete. The guard must stay out of the way.
fixture "$q07/ok"
sed 's/"name":"vault-agent"/"name":"agent"/' "$q07/misnamed/json" \
  | sed 's/"capabilities"/"runAsNonRoot":true,"capabilities"/' > "$q07/ok/json"
canned "$q07/ok" '{.spec.containers[*].name}' 'agent'
canned "$q07/ok" '{.spec.containers[?(@.name=="agent")].securityContext.runAsUser}'     '10001'
canned "$q07/ok" '{.spec.containers[?(@.name=="agent")].securityContext.runAsGroup}'    '20001'
canned "$q07/ok" '{.spec.containers[?(@.name=="agent")].securityContext.runAsNonRoot}'  'true'

out=$(FIXTURE=$q07/ok run_check banks/ckad-mock-01/q07/validate.d/10_identity.sh "$q07/bin")
rc=$?
[ "$rc" = 0 ] && note || bad "q07 correct answer no longer passes: exit $rc, got '$out'"
case $out in
  "identity ok"*) note ;;
  *) bad "q07 correct answer lost its message: got '$(printf '%s' "$out" | head -1)'" ;;
esac
[ "$(printf '%s' "$out" | grep -c 'sim:criterion fail')" = 0 ] && note \
  || bad "q07 correct answer reported a failed criterion"

# ------------------------------------------------- expected_dir under rewrite
#
# run_check executes a REWRITTEN copy of the script from a temp directory, so
# $0 inside it is that copy and the qid is gone. Without SIM_CHECK_PATH every
# show_pair in the bank would look for its document under $tmp/expected/ and
# find nothing — and show_expected returns quietly on a missing file, so the
# whole gate would keep passing while proving nothing about the pairs.
out=$(FIXTURE=$q07/misnamed run_check banks/ckad-mock-01/q07/validate.d/20_hardening.sh "$q07/bin")
case $out in
  *"sim:artifact expected"*) note ;;
  *) bad "check-evidence: a paired check produced no expected pane — SIM_CHECK_PATH is not reaching it" ;;
esac

# Case 3: nothing there at all. The pane must say so rather than vanish.
fixture "$q07/absent"
: > "$q07/absent/json"
out=$(FIXTURE=$q07/absent run_check banks/ckad-mock-01/q07/validate.d/10_identity.sh "$q07/bin")
case $out in
  *'sim:artifact actual'*) note ;;
  *) bad "q07 absent pod: no actual pane at all" ;;
esac
case $out in
  *"$ARTIFACT_EMPTY"*) note ;;
  *) bad "q07 absent pod: actual pane does not state that nothing was found" ;;
esac

# ------------------------------------------------------------------ q06 volume

q06=$tmp/q06
make_kubectl "$q06/bin"
fixture "$q06/misnamed"
cat > "$q06/misnamed/json" <<'JSON'
{"spec":{"volumes":[{"name":"app-limits","configMap":{"name":"app-limits"}}],
 "containers":[{"name":"tuned","volumeMounts":[{"name":"app-limits","mountPath":"/etc/app","readOnly":true}]}]}}
JSON
canned "$q06/misnamed" '{.spec.volumes[*].name}' 'app-limits'

out=$(FIXTURE=$q06/misnamed run_check banks/ckad-mock-01/q06/validate.d/30_volume.sh "$q06/bin")
case $out in
  *"no volume named 'limits'"*) note ;;
  *) bad "q06 misnamed volume: message does not name the volume. got: $(printf '%s' "$out" | head -1)" ;;
esac
case $out in
  *"found: app-limits"*) note ;;
  *) bad "q06 misnamed volume: does not report the name that exists" ;;
esac
case $out in
  *'sim:artifact actual'*) note ;;
  *) bad "q06 misnamed volume: no actual pane" ;;
esac

# ------------------------------------------------------- q25 ephemeral container
#
# An ephemeral container can never be removed, so a first attempt under a name
# you did not want is permanent. Grading the name made the check unrecoverable:
# a real attempt added `debugger` without --target, retried correctly as
# `debugger2`, and scored 0/4 for work that was done.

q25=$tmp/q25
make_kubectl "$q25/bin"
eph_fixture() { # dir, ephemeralContainers JSON array
  fixture "$1"
  cat > "$1/json" <<JSON
{"spec":{"containers":[{"name":"api"}],"ephemeralContainers":$2}}
JSON
  canned "$1" '{range .spec.containers[*]}{.name}{"\n"}{end}' 'api'
}

crit_count() { printf '%s' "$1" | grep -c "sim:criterion $2"; }

# The real attempt: a wrong first try left behind, and a correct second one.
eph_fixture "$q25/retried" '[{"name":"debugger","image":"busybox:1.37"},
  {"name":"debugger2","image":"busybox:1.37","targetContainerName":"api"}]'
out=$(FIXTURE=$q25/retried run_check banks/ckad-mock-01/q25/validate.d/10_ephemeral.sh "$q25/bin")
rc=$?
[ "$rc" = 0 ] && note || bad "q25 retried under a second name: exit $rc, want 0 — the objectives were met"
[ "$(crit_count "$out" fail)" = 0 ] && note || bad "q25 retried: criteria reported a failure"

# Named exactly as the old question demanded: must still pass.
eph_fixture "$q25/named" '[{"name":"debugger","image":"busybox:1.37","targetContainerName":"api"}]'
out=$(FIXTURE=$q25/named run_check banks/ckad-mock-01/q25/validate.d/10_ephemeral.sh "$q25/bin")
[ "$?" = 0 ] && note || bad "q25 single correctly-named container no longer passes"

# An unusual name is not a defect.
eph_fixture "$q25/odd" '[{"name":"debugger-8kx2t","image":"busybox:1.37","targetContainerName":"api"}]'
out=$(FIXTURE=$q25/odd run_check banks/ckad-mock-01/q25/validate.d/10_ephemeral.sh "$q25/bin")
[ "$?" = 0 ] && note || bad "q25 auto-generated name rejected, but the name is not graded"

# --target forgotten and never retried: partial, not zero.
eph_fixture "$q25/notarget" '[{"name":"debugger","image":"busybox:1.37"}]'
out=$(FIXTURE=$q25/notarget run_check banks/ckad-mock-01/q25/validate.d/10_ephemeral.sh "$q25/bin")
rc=$?
[ "$rc" = 1 ] && note || bad "q25 missing --target: exit $rc, want 1"
[ "$(crit_count "$out" 'pass 1 runs busybox')" = 1 ] && note \
  || bad "q25 missing --target: the image criterion should still be credited"
[ "$(crit_count "$out" "fail 3 shares")" = 1 ] && note \
  || bad "q25 missing --target: the namespace criterion should be the one that failed"

# Nothing attached at all is a gate: no criteria, so no partial credit.
eph_fixture "$q25/none" '[]'
out=$(FIXTURE=$q25/none run_check banks/ckad-mock-01/q25/validate.d/10_ephemeral.sh "$q25/bin")
[ "$(crit_count "$out" '')" = 0 ] && note \
  || bad "q25 nothing attached: emitted criteria, so it would earn partial credit for no work"
case $out in
  *"no ephemeral containers"*) note ;;
  *) bad "q25 nothing attached: message does not say so. got: $(printf '%s' "$out" | head -1)" ;;
esac

# ------------------------------------------------ every check, smoke-run for real
#
# A jq program written in double quotes inside "$( ... )" is a trap: the outer
# layer unescapes \" into a real quote, the program ends early, and bash brace-
# expands the {…} jq was supposed to receive. That shipped once and the only
# visible symptom was jq noise where the evidence pane should have been. So run
# every check against a stub that answers everything with an empty object and
# assert the tooling itself never complains.

all=$tmp/all
make_kubectl "$all/bin"
fixture "$all/fx"
echo '{}' > "$all/fx/json"
# Everything else a check might shell out to, stubbed to succeed silently.
for cmd in helm podman curl yq; do
  printf '#!/usr/bin/env bash\nexit 0\n' > "$all/bin/$cmd"
  chmod +x "$all/bin/$cmd"
done

# ---------------------------------------------------- the stubs shadow, offline
#
# Both of these are the difference between "the check was exercised" and "the
# check reached the reviewer's own machine". They are asserted rather than
# assumed because a stub that is not on PATH fails silently: the real binary
# answers, the case still goes green, and nothing says which one ran.

probe=$tmp/probe
fixture "$probe"
printf 'stub-ssh-answer\n' > "$probe/ssh"
out=$(PATH="$all/bin:$PATH" FIXTURE="$probe" ssh -o ConnectTimeout=5 cka-aux-etcd \
  'etcdctl snapshot status /opt/backup/etcd.db' 2>&1)
case $out in
  stub-ssh-answer*) note ;;
  *) bad "ssh is not shadowed on a check's PATH — the CKA etcd check's node read would leave this machine (got: ${out})" ;;
esac

# The aux-cluster questions read a second cluster with
# `kubectl --kubeconfig ~candidate/.kube/aux-<name> --request-timeout=5s …`.
# The stub keys off -o alone, so those flags have to pass straight through
# rather than being mistaken for a subcommand.
echo '{}' > "$probe/json"
out=$(PATH="$all/bin:$PATH" FIXTURE="$probe" kubectl \
  --kubeconfig /home/candidate/.kube/aux-etcd --request-timeout=5s \
  -n kube-system get pods -o json 2>&1)
[ "$out" = "{}" ] && note \
  || bad "the kubectl stub does not answer an aux --kubeconfig read (got: ${out})"

# What a broken program looks like when the TOOL says so, in the shapes the
# tools actually print:
#
#   jq: parse error: Invalid numeric literal at line 1, column 2
#   jq: error: syntax error, unexpected end of file … / jq: 1 compile error
#   Error: bad file '-': yaml: while parsing a flow node …        (yq)
#   /tmp/chk.sh: line 12: syntax error near unexpected token `fi'
#   /tmp/chk.sh: line 4: kubectl: command not found
#   /tmp/chk.sh: line 4: NS: unbound variable
#
# The patterns are anchored to those shapes rather than to the bare English in
# them, because the same words are ordinary prose in a check's own evidence: a
# CoreDNS question explaining that a stray brace "is a syntax error in the
# block" was failing this gate while handing jq nothing at all. Prose is not
# the bug, and rewording every question that has to name a parse failure would
# be. One pattern serves both the verdict and the excerpt, so the two cannot
# drift apart the way the duplicated list they replace could.
# jq's RUNTIME complaints are deliberately not in here. "jq: error (at
# <stdin>:0): Cannot iterate over null" is what the {} stub provokes from every
# check that walks a list, and it says nothing about the program — which is why
# the malformed-program shape to match is "jq: N compile error", the line jq
# always prints alongside "jq: error: syntax error, …", and never a bare
# "jq: error".
TOOL_NOISE='jq: parse error|jq: [0-9]+ compile error|yq: [Ee]rror|^parse error:|^Error: .*(yaml|json|parse error)|line [0-9]+: syntax error|syntax error near|: command not found|: unbound variable'

noisy=0
for script in banks/*/q*/validate.d/*.sh; do
  out=$(FIXTURE=$all/fx run_check "$script" "$all/bin" </dev/null || true)
  # Only malformed PROGRAMS count. A stub that answers {} makes jq complain at
  # runtime ("Cannot iterate over null") for every check that walks a list, and
  # that says nothing about the script — a real cluster returns a real object,
  # or nothing at all.
  if printf '%s\n' "$out" | grep -qE "$TOOL_NOISE"; then
    echo "FAIL: $script hands its tooling something malformed:"
    printf '%s\n' "$out" | grep -E "$TOOL_NOISE" | head -3 | sed 's/^/        /'
    noisy=$((noisy+1))
  fi
done
if [ "$noisy" -eq 0 ]; then note; else FAIL=$((FAIL+noisy)); fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "check-evidence: $PASS passed, 0 failed"
else
  echo "check-evidence: $PASS passed, $FAIL failed"
fi
[ "$FAIL" -eq 0 ]
