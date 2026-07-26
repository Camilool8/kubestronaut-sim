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

./sim purge   # cold start: the fresh-grade-0 assertion needs pristine cluster state
./sim up
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
wait_workloads() {
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
  [ "$earned" = "$t1" ] || fail "facilitator results: earned should be ${t1}, got ${earned}"
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

echo "== bank switch: CKAD -> CKA -> CKAD round-trip via the conductor =="
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

curl -fsS -X POST -H 'Content-Type: application/json' -d '{"bank":"cka-mock-01"}' \
  http://localhost:8080/api/control/switch >/dev/null || fail "switch to cka-mock-01 not accepted"
wait_control

status=$(req GET /api/exam)
api_name=$(json_field name)
[ "$api_name" = "cka-mock-01" ] || fail "active exam should be cka-mock-01, got $api_name"
docker compose exec desktop cat /shared/exam/motd | grep -q 'CKA Mock Exam 01' \
  || fail "desktop motd should mention the CKA exam after the switch"

./sim grade | tee /tmp/grade-cka0.txt
read -r _ ce0 ct0 _ < <(grep '^RESULT ' /tmp/grade-cka0.txt)
[ "$ce0" = "0" ] || fail "fresh cka env should score 0, got ${ce0}"

docker compose exec instance-1 su - candidate -c 'bash /tests/solutions/cka-mock-01/q01.sh'
./sim grade | tee /tmp/grade-cka1.txt
read -r _ ce1 _ _ < <(grep '^RESULT ' /tmp/grade-cka1.txt)
[ "$ce1" -gt 0 ] 2>/dev/null || fail "solved cka q01 should score > 0, got ${ce1}"

curl -fsS -X POST -H 'Content-Type: application/json' -d '{"bank":"ckad-mock-01"}' \
  http://localhost:8080/api/control/switch >/dev/null || fail "switch back to ckad-mock-01 not accepted"
wait_control

status=$(req GET /api/exam)
api_name=$(json_field name)
[ "$api_name" = "ckad-mock-01" ] || fail "active exam should be back to ckad-mock-01, got $api_name"
./sim grade | tee /tmp/grade-back.txt
read -r _ be0 _ _ < <(grep '^RESULT ' /tmp/grade-back.txt)
[ "$be0" = "0" ] || fail "ckad after switch-back should score 0, got ${be0}"

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
