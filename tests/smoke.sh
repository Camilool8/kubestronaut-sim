#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

FAILURES=0
fail() { echo "SMOKE FAIL: $1"; FAILURES=$((FAILURES+1)); }

BASE=http://localhost:8080
RESP=/tmp/smoke-http.json

# req METHOD PATH -> prints the HTTP status code; response body lands in $RESP.
req() { curl -s -o "$RESP" -w '%{http_code}' -X "$1" "$BASE$2"; }

# json_field NAME -> prints top-level field NAME from $RESP ("" if absent),
# via python3 (available on macOS and the ubuntu CI runner alike).
json_field() {
  RESP="$RESP" FIELD="$1" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
print(data.get(os.environ["FIELD"], ""))
'
}

# Offline and instant, so it runs before anything is torn down: a
# mis-weighted bank should fail in two seconds, not forty minutes in
# after a full cold boot.
bash tests/bank-weights.sh || fail "bank weights are out of balance"
# Same slot, same reason: a check that grades spelling rather than
# behaviour should fail here, not silently cost a candidate points.
bash tests/check-lint.sh || fail "validate.d checks have brittle idioms"
bash tests/check-lib.sh || fail "banks/_lib/checks.sh helpers are broken"
bash tests/bank-hints.sh || fail "hints are malformed, or are just the solution"

./sim purge   # cold start: the fresh-grade-0 assertion needs pristine cluster state

# Bounded. `./sim up` used to be able to hang indefinitely (compose's
# --wait defaults to no timeout), and because this script is `set -e`
# with no timeout of its own, a hung boot hung the whole suite — the one
# failure mode that produces no output at all. SIM_BOOT_BUDGET bounds
# ./sim up internally; this is the belt to that braces.
SMOKE_BOOT_BUDGET=${SMOKE_BOOT_BUDGET:-3600}
boot_started=$SECONDS
if ! SIM_BOOT_BUDGET="$SMOKE_BOOT_BUDGET" ./sim up; then
  echo "SMOKE FAIL: ./sim up did not reach a ready environment within ${SMOKE_BOOT_BUDGET}s"
  docker compose logs --tail 80 k8s-env || true
  exit 1
fi
echo "cold boot took $((SECONDS - boot_started))s"

# The boot reporting the UI now depends on. A cold boot that finished but
# never reported ready would leave every candidate stuck on a progress
# screen in front of a working cluster.
echo "== boot state =="
[ "$(req GET /api/boot)" = "200" ] || fail "GET /api/boot did not answer 200"
[ "$(json_field state)" = "ready" ] || fail "/api/boot state is '$(json_field state)', want ready"
[ -n "$(json_field label)" ] || fail "/api/boot reports no label"

docker compose exec instance-1 su - candidate -c 'kubectl get nodes --no-headers' | tee /tmp/nodes.txt
[ "$(grep -c ' Ready ' /tmp/nodes.txt)" -eq 2 ] || fail "expected 2 Ready nodes"

echo "== cluster add-ons: enforcing CNI, ingress controller, helm repo, registry =="
# Nodes cannot reach Ready without a CNI, so the assertion above already
# proves *a* CNI is running. What matters is which one: kindnet routes
# but does not enforce policy, and every NetworkPolicy question in every
# bank is only worth marking if this is Calico.
docker compose exec k8s-env kubectl -n kube-system get daemonset calico-node >/dev/null 2>&1 \
  || fail "calico-node is missing — NetworkPolicy would not be enforced"
docker compose exec k8s-env kubectl -n kube-system get daemonset kindnet >/dev/null 2>&1 \
  && fail "kindnet is still installed; disableDefaultCNI should have removed it" || true

# The behavioural proof, which is the whole point of the CNI swap: a
# default-deny policy must make traffic time out, not merely exist as an
# object. Run in a scratch namespace so no bank state is touched.
docker compose exec -T k8s-env sh <<'PROBE'
set -e
kubectl create namespace netpol-smoke --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n netpol-smoke run target --image=nginx:1.29-alpine --labels=app=target \
  --port=80 >/dev/null 2>&1 || true
kubectl -n netpol-smoke expose pod target --port=80 >/dev/null 2>&1 || true
kubectl -n netpol-smoke wait --for=condition=Ready pod/target --timeout=120s >/dev/null
# Reachable before any policy exists.
kubectl -n netpol-smoke run probe-before --rm -i --restart=Never --image=busybox:1.37 \
  --command -- wget -q -T 5 -O- http://target >/dev/null 2>&1 \
  || { echo "PROBE: target unreachable before any policy"; exit 1; }
kubectl -n netpol-smoke apply -f - >/dev/null <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: deny-all, namespace: netpol-smoke}
spec:
  podSelector: {}
  policyTypes: [Ingress]
EOF
sleep 5   # let the CNI programme the rules
if kubectl -n netpol-smoke run probe-after --rm -i --restart=Never --image=busybox:1.37 \
     --command -- wget -q -T 5 -O- http://target >/dev/null 2>&1; then
  echo "PROBE: deny-all did NOT block traffic — the CNI is not enforcing policy"
  exit 1
fi
kubectl delete namespace netpol-smoke --wait=false >/dev/null
PROBE
[ $? -eq 0 ] || fail "NetworkPolicy is not enforced by the CNI"

docker compose exec k8s-env kubectl -n ingress-nginx get deploy ingress-nginx-controller \
  -o jsonpath='{.status.readyReplicas}' | grep -q '^[1-9]' \
  || fail "ingress-nginx controller has no ready replica"
# It must be on the control-plane node: only that node has the port
# mappings, so anywhere else means the host path silently 404s.
docker compose exec k8s-env kubectl -n ingress-nginx get pod \
  -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].spec.nodeName}' \
  | grep -q 'sim-control-plane' \
  || fail "ingress controller is not on the control-plane node (host port chain would be dead)"

docker compose exec instance-1 su - candidate -c 'helm repo list' | grep -q '^sim' \
  || fail "the 'sim' helm repo is not configured on instance-1"
docker compose exec instance-1 su - candidate -c 'helm search repo sim/sim-web --versions -o json' \
  | grep -q '1.1.0' || fail "helm repo index is missing sim-web 1.1.0"

docker compose exec instance-1 curl -fsS --max-time 10 http://registry:5000/v2/ >/dev/null \
  || fail "the exam registry is not reachable from instance-1"

# The full image-building loop a question asks for: edit, build, tag,
# push, run, read the logs back. Slow under the vfs storage driver, which
# is why the image is three lines.
docker compose exec -T instance-1 bash <<'PODMAN'
set -e
work=$(mktemp -d)
cat > "$work/Dockerfile" <<'EOF'
FROM alpine:3.21
ENV SIM_SMOKE=ok
CMD ["sh", "-c", "echo smoke-$SIM_SMOKE"]
EOF
podman build -q -t registry:5000/smoke:v1 "$work" >/dev/null
podman push --tls-verify=false registry:5000/smoke:v1 >/dev/null
podman run --rm registry:5000/smoke:v1 | grep -qx 'smoke-ok'
rm -rf "$work"
PODMAN
[ $? -eq 0 ] || fail "podman build/push/run against registry:5000 failed on instance-1"

echo "== host -> cluster: an Ingress answers on the published port =="
docker compose exec -T k8s-env sh <<'INGRESS'
set -e
kubectl create namespace ingress-smoke --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n ingress-smoke create deployment site --image=nginx:1.29-alpine >/dev/null 2>&1 || true
kubectl -n ingress-smoke expose deployment site --port=80 >/dev/null 2>&1 || true
kubectl -n ingress-smoke apply -f - >/dev/null <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: {name: site, namespace: ingress-smoke}
spec:
  ingressClassName: nginx
  rules:
    - host: smoke.sim.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: {service: {name: site, port: {number: 80}}}
EOF
kubectl -n ingress-smoke rollout status deployment/site --timeout=180s >/dev/null
INGRESS
[ $? -eq 0 ] || fail "could not create the smoke Ingress"

# Poll: ingress-nginx takes a moment to pick up a new rule.
ing_ok=0
for _ in $(seq 1 20); do
  if curl -fsS --max-time 5 -H 'Host: smoke.sim.local' http://localhost:8081/ | grep -q 'nginx'; then
    ing_ok=1; break
  fi
  sleep 3
done
[ "$ing_ok" = "1" ] || fail "Ingress did not answer on the published host port :8081"
docker compose exec k8s-env kubectl delete namespace ingress-smoke --wait=false >/dev/null

echo "== published ports bind every interface (SIM_BIND default) =="
# The bind address is the thing that changed; asserting on it directly
# beats trying to find a routable LAN address on an arbitrary runner.
docker compose port facilitator 8080 | grep -q '^0\.0\.0\.0:' \
  || fail "facilitator should publish on 0.0.0.0 by default (SIM_BIND)"
docker compose port k8s-env 80 | grep -q '^0\.0\.0\.0:' \
  || fail "the ingress host port should publish on 0.0.0.0 by default (SIM_BIND)"

echo "== facilitator: healthz, exam metadata, built UI, desktop only via :8080 =="
status=$(req GET /healthz)
[ "$status" = "200" ] || fail "healthz expected 200, got $status"

status=$(req GET /api/exam)
[ "$status" = "200" ] || fail "/api/exam expected 200, got $status"
bank_title=$(grep -m1 -E '^[[:space:]]*title:' banks/ckad-mock-01/exam.yaml | sed -E 's/^[[:space:]]*title:[[:space:]]*//')
api_title=$(json_field title)
[ "$api_title" = "$bank_title" ] || fail "/api/exam title mismatch: bank='$bank_title' api='$api_title'"

status=$(req GET /)
grep -q 'assets/' "$RESP" || fail "exam UI '/' did not serve the built assets"

# The desktop is reachable through the facilitator's session-gated
# /desktop proxy and nowhere else. (The stack does publish other ports
# now — the cluster's ingress and NodePort band on k8s-env — but the
# desktop's own noVNC port is deliberately not among them, because that
# path would bypass the gate below.)
curl -fsS --max-time 5 -o /dev/null http://localhost:6080/vnc.html \
  && fail "port 6080 should not be reachable from the host (it would bypass the session gate)" || true

status=$(req GET /desktop/vnc.html)
[ "$status" = "403" ] || fail "desktop should be 403 while idle, got $status"

status=$(req GET /api/questions/q01/solution)
[ "$status" = "403" ] || fail "solution should be 403 before the session ends, got $status"

# desktop container itself: proxy allowlist enforced; no direct egress; ssh to instances works
docker compose exec desktop curl -fsS --max-time 15 -o /dev/null -x http://docs-proxy:3128 https://kubernetes.io \
  || fail "proxy should allow kubernetes.io"
docker compose exec desktop curl -fs --max-time 15 -o /dev/null -x http://docs-proxy:3128 https://example.com \
  && fail "proxy should block example.com" || true
# kubernetes.io's docs JS is one big jQuery IIFE: block this and the search
# box, tab panes and sidebar never wire up, which reads as "the docs are broken".
docker compose exec desktop curl -fsS --max-time 15 -o /dev/null -x http://docs-proxy:3128 https://code.jquery.com/jquery-3.7.1.min.js \
  || fail "proxy should allow code.jquery.com (kubernetes.io docs depend on it)"
# Widening the allowlist must not turn the exam browser into general web access.
docker compose exec desktop curl -fs --max-time 15 -o /dev/null -x http://docs-proxy:3128 https://www.googletagmanager.com \
  && fail "proxy should still block analytics" || true
docker compose exec desktop curl -fs --max-time 15 -o /dev/null -x http://docs-proxy:3128 https://www.google.com \
  && fail "proxy should still block open web search (kubernetes.io falls back to its own Pagefind index)" || true
# The unsafe-paste dialog would interrupt every paste of an exam value.
docker compose exec desktop grep -q '^MiscShowUnsafePasteDialog=FALSE' \
  /home/candidate/.config/xfce4/terminal/terminalrc \
  || fail "terminal unsafe-paste dialog is not disabled"
docker compose exec desktop curl -s --max-time 5 -o /dev/null https://example.com \
  && fail "desktop should have no direct egress" || true
docker compose exec desktop su - candidate -c 'ssh -o BatchMode=yes instance-1 kubectl get nodes --no-headers' \
  | grep -q ' Ready ' || fail "desktop->instance-1 ssh broken"

# ready-to-go desktop: the exam terminal is already open (autostart) and
# the welcome banner follows the active bank
docker compose exec desktop pgrep -f "xfce4-terminal" >/dev/null \
  || fail "desktop should auto-open the exam terminal"
docker compose exec desktop cat /shared/exam/motd | grep -q 'ssh instance-1' \
  || fail "desktop motd should list the ssh targets"

# conductor isolation: the docker-socket-holding sidecar must be invisible
# from the host and from the exam network; its API is reachable only
# through the facilitator's /api/control proxy on :8080
curl -fsS --max-time 5 -o /dev/null http://localhost:9000/healthz \
  && fail "conductor should not be reachable from the host" || true
docker compose exec desktop curl -fs --max-time 5 -o /dev/null http://conductor:9000/healthz \
  && fail "conductor should not be reachable from the desktop" || true
status=$(req GET /api/control/status)
[ "$status" = "200" ] || fail "/api/control/status expected 200 via :8080, got $status"

echo "== session lifecycle: start, countdown, desktop unlock =="
status=$(req POST /api/session/start)
[ "$status" = "200" ] || fail "session start expected 200, got $status"
state=$(json_field state)
[ "$state" = "running" ] || fail "session start should report running, got $state"
dur=$(json_field durationSeconds)
rem1=$(json_field remainingSeconds)
[ "$rem1" -le "$dur" ] 2>/dev/null || fail "remaining ($rem1) should be <= duration ($dur) right after start"

sleep 3
status=$(req GET /api/session)
[ "$status" = "200" ] || fail "/api/session expected 200, got $status"
rem2=$(json_field remainingSeconds)
[ "$rem2" -lt "$rem1" ] 2>/dev/null || fail "remaining should strictly decrease (was $rem1, now $rem2)"

status=$(req GET /desktop/vnc.html)
[ "$status" = "200" ] || fail "desktop should be 200 while running, got $status"

status=$(req GET /api/questions/q01/solution)
[ "$status" = "403" ] || fail "solution should still be 403 while the session is running, got $status"

./sim grade | tee /tmp/grade0.txt
read -r _ e0 t0 _ < <(grep '^RESULT ' /tmp/grade0.txt)
[ "$e0" = "0" ] || fail "fresh env should score 0, got ${e0}"

# Blocks until every Deployment in the cluster is Available. Bare Pods are
# deliberately not covered: one question seeds a crash-looping Pod, so
# "all Pods Ready" is a condition this cluster is designed never to meet.
#
# `condition=Available` is NOT enough on its own, which is what the
# resumed-score assertion discovered: a Deployment reports Available on
# minimum availability, so it goes true while replicas are still coming
# back after a restart, and it says nothing about EndpointSlices having
# repopulated. A grade run in that window scored 134/180 with failures
# that were all readiness-shaped (`readyReplicas=''`, `0 ready
# endpoints`) on a cluster that had graded 180/180 minutes earlier.
#
# `kubectl wait` also returns 0 when it matches nothing at all, so a
# too-early call could pass by finding no Deployments yet. Hence the
# explicit count.
wait_workloads() {
  # Gate on live POD phase, never on Deployment status.
  #
  # This is the trap that cost two smoke runs. After ./sim down && ./sim
  # up the node re-registers, and for ~40s its pods sit in `Unknown`
  # while the Deployment's own .status still carries the values from
  # before the restart. So `kubectl wait --for=condition=Available` and a
  # readyReplicas comparison BOTH pass instantly against stale data —
  # measured directly: every Deployment reported full readyReplicas while
  # 38 pods were Unknown. The grade then reads live state and collapses
  # (128/180 and 134/180 on two runs). Waiting properly, the same
  # environment grades 180/180.
  #
  # Unknown/Pending/ContainerCreating mean "not settled yet".
  # Error/CrashLoopBackOff are settled states this bank creates on
  # purpose (q17 seeds a crash-looping Pod), so they must NOT be waited
  # on or this never returns.
  local budget=300 elapsed=0 unsettled stable=0
  while [ "$elapsed" -lt "$budget" ]; do
    unsettled=$(docker compose exec -T k8s-env kubectl get pods --all-namespaces \
      --no-headers 2>/dev/null \
      | awk '$4=="Unknown" || $4=="Pending" || $4=="ContainerCreating" || $4=="PodInitializing" {print $1"/"$2}' \
      | tr '\n' ' ')
    if [ -z "${unsettled// /}" ]; then
      # Require it twice running: the window right after the API server
      # returns can look calm before the kubelet reports anything.
      stable=$((stable + 1))
      [ "$stable" -ge 2 ] && break
    else
      stable=0
    fi
    sleep 5; elapsed=$((elapsed + 5))
  done
  [ "$stable" -ge 2 ] || fail "pods still unsettled after ${budget}s: ${unsettled}"

  # Only now is Deployment status fresh enough to be worth asserting on.
  docker compose exec -T k8s-env kubectl wait --for=condition=Available \
    deployments --all --all-namespaces --timeout=300s >/dev/null 2>&1 \
    || fail "cluster workloads did not become Available within 300s"
}

# Solve every question, each on the instance its exam.yaml entry names.
# Driven from the bank rather than a hand-kept list: a question added
# without a solution script, or pointed at the wrong instance, fails here
# instead of quietly costing points in the 100% assertion below.
solve_bank() {
  local bank=$1 qid inst
  while read -r qid inst; do
    [ -n "$qid" ] || continue
    [ -f "tests/solutions/${bank}/${qid}.sh" ] \
      || { fail "no solution script for ${bank}/${qid}"; continue; }
    # </dev/null is load-bearing: `compose exec -T` reads stdin, and
    # without it the first question swallows the rest of the loop's input
    # and only one solution ever runs.
    docker compose exec -T "$inst" su - candidate \
      -c "bash /tests/solutions/${bank}/${qid}.sh" \
      >"/tmp/smoke-${bank}-${qid}.log" 2>&1 </dev/null \
      || fail "${bank}/${qid} solution failed (see /tmp/smoke-${bank}-${qid}.log)"
  done < <(docker compose exec -T k8s-env yq -r \
    ".spec.questions[] | .id + \" \" + .instance" "/banks/${bank}/exam.yaml" | tr -d '\r')
}

solve_bank ckad-mock-01

./sim grade | tee /tmp/grade1.txt
read -r _ e1 t1 _ < <(grep '^RESULT ' /tmp/grade1.txt)
[ "$e1" = "$t1" ] || fail "solved env should score ${t1}/${t1}, got ${e1}/${t1}"

echo "== session end: submit, poll facilitator results, solutions/desktop re-gate =="
status=$(req POST /api/session/end)
[ "$status" = "202" ] || fail "session end expected 202, got $status"

budget=60; interval=2; elapsed=0; rstatus=""
while [ "$elapsed" -lt "$budget" ]; do
  rstatus=$(req GET /api/results)
  [ "$rstatus" = "200" ] && break
  sleep "$interval"
  elapsed=$((elapsed + interval))
done
[ "$rstatus" = "200" ] || fail "/api/results did not reach 200 within ${budget}s (last status ${rstatus})"

if [ "$rstatus" = "200" ]; then
  earned=$(json_field earned)
  total=$(json_field total)
  passed=$(json_field passed)
  # totals come from the grade run above, not a hardcoded bank size
  # Name the checks, not just the shortfall. "earned should be 180, got
  # 170" is true and useless: the same cluster state had just graded
  # 180/180 through `./sim grade`, so the interesting information is
  # *which* ten points disagreed, and every one of them is sitting in the
  # response body already.
  if [ "$earned" != "$t1" ]; then
    fail "facilitator results: earned should be ${t1}, got ${earned}"
    echo "  checks the facilitator scored as failed:"
    # %-formatting, not f-strings: this whole program is inside a
    # single-quoted shell string, so a nested " has to be escaped for the
    # shell and Python then sees the backslash. It used to read
    # f"{q[\"id\"]}" and died with "unexpected character after line
    # continuation character" the first time it ever ran — which was the
    # first time an assertion here failed, long after it was written.
    RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
for q in data.get("questions", []):
    for c in q.get("checks", []):
        if not c.get("passed"):
            print("    %4s  %spts  %s" % (q.get("id", ""), c.get("points", 0), c.get("desc", "")))
            print("          %s" % c.get("message", ""))
' || echo "    (could not parse $RESP)"
  fi
  [ "$total" = "$t1" ] || fail "facilitator results: total should be ${t1}, got ${total}"
  [ "$passed" = "True" ] || fail "facilitator results: passed should be true, got ${passed}"
fi

status=$(req GET /api/questions/q01/solution)
[ "$status" = "200" ] || fail "solution should be 200 once the session has ended, got $status"

status=$(req GET /desktop/vnc.html)
[ "$status" = "403" ] || fail "desktop should be 403 once the session has ended, got $status"

status=$(req DELETE /api/session)
[ "$status" = "204" ] || fail "DELETE /api/session expected 204, got $status"

status=$(req GET /api/session)
state=$(json_field state)
[ "$state" = "idle" ] || fail "session should be idle right after DELETE, got $state"

# warm restart: down + up must resume exam state
./sim down
./sim up
# `./sim up --wait` waits for *container* health; the cluster's own
# workloads come back well after that, and several checks assert on ready
# replicas or make live requests. Grading straight away measures how fast
# the machine is, not whether state resumed.
wait_workloads
./sim grade | tee /tmp/grade2.txt
read -r _ e2 t2 _ < <(grep '^RESULT ' /tmp/grade2.txt)
[ "$e2" = "$t2" ] || fail "resumed env should keep score ${t2}/${t2}, got ${e2}/${t2}"

# reset: fresh exam state, /opt/course dirs re-created empty, session cleared too
./sim reset
./sim grade | tee /tmp/grade3.txt
read -r _ e3 _ _ < <(grep '^RESULT ' /tmp/grade3.txt)
[ "$e3" = "0" ] || fail "reset env should score 0, got ${e3}"
docker compose exec instance-1 su - candidate -c 'test -d /opt/course/1 -a -w /opt/course/1 -a -z "$(ls -A /opt/course/1)"' \
  || fail "reset should leave /opt/course/1 empty and writable"

status=$(req GET /api/session)
state=$(json_field state)
[ "$state" = "idle" ] || fail "session should be idle after ./sim reset, got $state"

echo "== bank switch: CKAD -> smoke-01 -> CKAD round-trip via the conductor =="
# wait_control polls the control status until the conductor goes idle,
# failing the smoke if the finished job carries an error.
wait_control() {
  local budget=300 elapsed=0 body busy err
  while [ "$elapsed" -lt "$budget" ]; do
    if body=$(curl -fsS http://localhost:8080/api/control/status 2>/dev/null); then
      busy=$(printf '%s' "$body" | python3 -c 'import json,sys; print(json.load(sys.stdin)["busy"])')
      if [ "$busy" = "False" ]; then
        err=$(printf '%s' "$body" | python3 -c 'import json,sys; print((json.load(sys.stdin).get("lastJob") or {}).get("error",""))')
        [ -z "$err" ] || fail "control job failed: $err"
        return 0
      fi
    fi
    sleep 3; elapsed=$((elapsed + 3))
  done
  fail "control job did not finish within ${budget}s"
}

status=$(req GET /api/control/banks)
[ "$status" = "200" ] || fail "/api/control/banks expected 200, got $status"
active=$(json_field active)
[ "$active" = "ckad-mock-01" ] || fail "active bank should be ckad-mock-01, got $active"

# A coming-soon certification must be refused, not attempted. This is
# end-to-end coverage of catalog.Switchable that did not exist before —
# and it matters more now that CKA is a coming-soon entry rather than a
# two-question bank.
curl -s -o "$RESP" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"bank":"cka-mock"}' http://localhost:8080/api/control/switch > /tmp/smoke-cs.txt
[ "$(cat /tmp/smoke-cs.txt)" = "400" ] \
  || fail "switch to a coming-soon bank should be 400, got $(cat /tmp/smoke-cs.txt)"

# And a bank id that is not a slug must never reach a filesystem path.
curl -s -o "$RESP" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"bank":"../../etc"}' http://localhost:8080/api/control/switch > /tmp/smoke-tr.txt
[ "$(cat /tmp/smoke-tr.txt)" = "400" ] \
  || fail "switch to a traversal id should be 400, got $(cat /tmp/smoke-tr.txt)"

# The real round trip, against banks/smoke-01 — a hidden one-question
# fixture. It exists so this path stays covered now that the CKA bank is
# gone: everything below (write-bank, recreate-cluster,
# restart-facilitator, verify, motd rewrite, score reset) is exercised
# exactly as before, and faster, because there is one question to seed.
curl -fsS -X POST -H 'Content-Type: application/json' -d '{"bank":"smoke-01"}' \
  http://localhost:8080/api/control/switch >/dev/null || fail "switch to smoke-01 not accepted"
wait_control

status=$(req GET /api/exam)
api_name=$(json_field name)
[ "$api_name" = "smoke-01" ] || fail "active exam should be smoke-01, got $api_name"
docker compose exec desktop cat /shared/exam/motd | grep -q 'Smoke Test Bank' \
  || fail "desktop motd should mention the smoke bank after the switch"

# A hidden bank must be switchable but must NOT appear in the lobby.
status=$(req GET /api/control/banks)
[ "$status" = "200" ] || fail "/api/control/banks expected 200, got $status"
# Inspect the banks array, not the whole body. The response is
# {"active": ..., "banks": [...]}, and this runs immediately after
# switching TO smoke-01 — so a grep for the bare id always matched the
# active field and this assertion could never pass. Catalog.List() does
# filter hidden entries; only the test was wrong.
listed=$(RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
print(",".join(b.get("id", "") for b in data.get("banks", [])))
' 2>/dev/null) || fail "could not parse /api/control/banks"
case ",${listed}," in
  *,smoke-01,*) fail "smoke-01 is a test fixture and must not appear in the bank list (got: ${listed})" ;;
esac
# ...and the bank the lobby *should* offer is still there, so an empty
# list cannot pass the assertion above by accident.
case ",${listed}," in
  *,ckad-mock-01,*) : ;;
  *) fail "the bank list should still offer ckad-mock-01 (got: ${listed})" ;;
esac

./sim grade | tee /tmp/grade-smoke0.txt
read -r _ se0 st0 _ < <(grep '^RESULT ' /tmp/grade-smoke0.txt)
[ "$se0" = "0" ] || fail "fresh smoke env should score 0, got ${se0}"

docker compose exec instance-1 su - candidate -c 'bash /tests/solutions/smoke-01/q01.sh'
./sim grade | tee /tmp/grade-smoke1.txt
read -r _ se1 _ _ < <(grep '^RESULT ' /tmp/grade-smoke1.txt)
[ "$se1" -gt 0 ] 2>/dev/null || fail "solved smoke q01 should score > 0, got ${se1}"

curl -fsS -X POST -H 'Content-Type: application/json' -d '{"bank":"ckad-mock-01"}' \
  http://localhost:8080/api/control/switch >/dev/null || fail "switch back to ckad-mock-01 not accepted"
wait_control

status=$(req GET /api/exam)
api_name=$(json_field name)
[ "$api_name" = "ckad-mock-01" ] || fail "active exam should be back to ckad-mock-01, got $api_name"
./sim grade | tee /tmp/grade-back.txt
read -r _ be0 _ _ < <(grep '^RESULT ' /tmp/grade-back.txt)
[ "$be0" = "0" ] || fail "ckad after switch-back should score 0, got ${be0}"

echo "== training mode: hints, solutions mid-attempt, scoring without ending =="
# Every gate below is server-side session state, so this is the only
# place they get exercised against a real facilitator rather than a stub.
status=$(req DELETE /api/session)
[ "$status" = "204" ] || fail "training: could not reset the session, got $status"

curl -s -o "$RESP" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"mode":"training"}' "${BASE}/api/session/start" > /tmp/smoke-tstart.txt
[ "$(cat /tmp/smoke-tstart.txt)" = "200" ] \
  || fail "training: start expected 200, got $(cat /tmp/smoke-tstart.txt)"
[ "$(json_field mode)" = "training" ] || fail "training: mode is '$(json_field mode)'"
[ "$(json_field untimed)" = "True" ] || fail "training: untimed is '$(json_field untimed)', want True"

# Hints: served one tier at a time, and only in this mode.
[ "$(req GET /api/questions/q01/hints/1)" = "200" ] || fail "training: hint 1 not served"
[ -n "$(json_field markdown)" ] || fail "training: hint 1 is empty"
[ "$(req GET /api/questions/q01/hints/99)" = "404" ] || fail "training: out-of-range hint should 404"

# Solutions, while the attempt is still RUNNING — the one gate training
# deliberately relaxes.
[ "$(req GET /api/questions/q01/solution)" = "200" ] \
  || fail "training: solutions should be readable during a training attempt"

# Scoring without ending. Must not appear on /api/results afterwards.
[ "$(req POST /api/session/grade)" = "200" ] || fail "training: mid-attempt grade failed"
[ "$(req GET /api/session)" = "200" ] && [ "$(json_field state)" = "running" ] \
  || fail "training: scoring must not end the attempt"
# 409, not 202. handleResults refuses with "session has not ended"
# whenever the state is not `ended`; 202 means ended-and-still-grading,
# which a running training attempt can never be. So 409 IS the proof that
# the practice grade was not recorded — the assertion wanted the right
# thing and named the wrong code, and contradicted the Go unit tests that
# already pin this contract.
[ "$(req GET /api/results)" = "409" ] \
  || fail "training: a practice grade must not be recorded as a result"

# Re-seeding one question leaves the rest of the environment alone.
curl -s -o "$RESP" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"question":"q01"}' "${BASE}/api/control/reseed" > /tmp/smoke-reseed.txt
[ "$(cat /tmp/smoke-reseed.txt)" = "200" ] \
  || fail "training: reseed expected 200, got $(cat /tmp/smoke-reseed.txt)"
# And a question id that is not in the bank never reaches a shell.
curl -s -o "$RESP" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"question":"../../etc"}' "${BASE}/api/control/reseed" > /tmp/smoke-reseed-bad.txt
[ "$(cat /tmp/smoke-reseed-bad.txt)" = "400" ] \
  || fail "training: a traversal question id should be 400, got $(cat /tmp/smoke-reseed-bad.txt)"

status=$(req DELETE /api/session)
[ "$status" = "204" ] || fail "training: cleanup DELETE expected 204, got $status"

# And the same gates must REFUSE in an exam attempt.
status=$(req POST /api/session/start)
[ "$status" = "200" ] || fail "exam-gate: start expected 200, got $status"
[ "$(json_field mode)" = "exam" ] || fail "exam-gate: mode is '$(json_field mode)', want exam"
[ "$(req GET /api/questions/q01/hints/1)" = "403" ] || fail "exam-gate: hints must be 403 in an exam"
[ "$(req GET /api/questions/q01/solution)" = "403" ] || fail "exam-gate: solutions must be 403 mid-exam"
[ "$(req POST /api/session/grade)" = "403" ] || fail "exam-gate: mid-attempt scoring must be 403 in an exam"
curl -s -o "$RESP" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"question":"q01"}' "${BASE}/api/control/reseed" > /tmp/smoke-reseed-exam.txt
[ "$(cat /tmp/smoke-reseed-exam.txt)" = "403" ] \
  || fail "exam-gate: reseed must be 403 in an exam, got $(cat /tmp/smoke-reseed-exam.txt)"
status=$(req DELETE /api/session)
[ "$status" = "204" ] || fail "exam-gate: cleanup DELETE expected 204, got $status"

echo "== auto-end: session expires unattended and re-locks the desktop =="
SESSION_DURATION_OVERRIDE=20s docker compose up -d --wait facilitator
status=$(req POST /api/session/start)
[ "$status" = "200" ] || fail "auto-end: session start expected 200, got $status"

sleep 25   # duration override is 20s; give the expiry timer margin to fire

status=$(req GET /api/session)
[ "$status" = "200" ] || fail "auto-end: /api/session expected 200, got $status"
state=$(json_field state)
reason=$(json_field endReason)
[ "$state" = "ended" ] || fail "auto-end: session should be ended after expiry, got $state"
[ "$reason" = "expired" ] || fail "auto-end: endReason should be expired, got $reason"

status=$(req GET /desktop/vnc.html)
[ "$status" = "403" ] || fail "auto-end: desktop should be 403 after expiry, got $status"

# recreate facilitator without the override (a grade may still be running in the
# background from the auto-end; Reset is allowed from any state, so DELETE is
# enough cleanup without waiting on those results) and leave a clean idle session
SESSION_DURATION_OVERRIDE="" docker compose up -d --wait facilitator
status=$(req DELETE /api/session)
[ "$status" = "204" ] || fail "auto-end cleanup: DELETE /api/session expected 204, got $status"

./sim down

if [ "$FAILURES" -eq 0 ]; then
  echo "SMOKE PASS (${e1}/${t1} solved, 0/${t0} fresh, ${e2}/${t2} resumed, ${e3} after reset)"
else
  echo "SMOKE FAIL: ${FAILURES} assertion(s) failed"
  exit 1
fi
