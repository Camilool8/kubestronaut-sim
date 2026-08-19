#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

FAILURES=0
fail() { echo "SMOKE FAIL: $1"; FAILURES=$((FAILURES+1)); }

BASE=http://localhost:8080
RESP=/tmp/smoke-http.json

req() { curl -s -o "$RESP" -w '%{http_code}' -X "$1" "$BASE$2"; }

json_field() {
  RESP="$RESP" FIELD="$1" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
print(data.get(os.environ["FIELD"], ""))
'
}

# A drawn question id from the attempt that is open now. The CKAD pool is deep
# enough that no particular id is drawn every time, so an assertion that names
# one by hand fails whenever the draw leaves it out.
drawn_qid() {
  req GET /api/exam >/dev/null
  RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    qs = json.load(f).get("questions", [])
print(qs[0]["id"] if qs else "")
'
}

bash tests/bank-weights.sh || fail "bank weights are out of balance"
bash tests/check-lint.sh || fail "validate.d checks have brittle idioms"
bash tests/check-lib.sh || fail "banks/_lib/checks.sh helpers are broken"
bash tests/bank-hints.sh || fail "hints are malformed, or are just the solution"
bash tests/bank-mcq.sh || fail "mcq banks are malformed"

./sim purge

echo "== nothing is built until an exam is chosen =="
idle_started=$SECONDS
if ! ./sim up; then
  fail "a bare ./sim up did not bring the shell up"
else
  echo "bare up took $((SECONDS - idle_started))s"

  [ "$(req GET /api/boot)" = "200" ] || fail "idle: GET /api/boot did not answer 200"
  [ "$(json_field state)" = "idle" ] || fail "idle: /api/boot state is '$(json_field state)', want idle"

  [ "$(req GET /api/exam)" = "503" ] || fail "idle: /api/exam should be 503 with no exam loaded"
  [ -n "$(json_field error)" ] || fail "idle: /api/exam refused with no explanation"
  [ "$(req GET /api/catalog)" = "200" ] || fail "idle: /api/catalog must answer — it is how an exam is chosen"
  [ "$(json_field active)" = "" ] || fail "idle: /api/catalog names an active bank when none was chosen"

  docker compose exec -T k8s-env kind get clusters 2>/dev/null | grep -qx sim \
    && fail "idle: a kind cluster exists before any exam was chosen" || true

  for svc in instance-1 instance-2 desktop facilitator; do
    docker compose ps --services --filter status=running | grep -qx "$svc" \
      || fail "idle: ${svc} is not running (it should be waiting for an exam, not exiting)"
  done
fi
./sim down

SMOKE_BOOT_BUDGET=${SMOKE_BOOT_BUDGET:-3600}
boot_started=$SECONDS
if ! SIM_BOOT_BUDGET="$SMOKE_BOOT_BUDGET" ./sim up ckad-mock-01; then
  echo "SMOKE FAIL: ./sim up did not reach a ready environment within ${SMOKE_BOOT_BUDGET}s"
  docker compose logs --tail 80 k8s-env || true
  exit 1
fi
echo "cold boot took $((SECONDS - boot_started))s"

echo "== boot state =="
[ "$(req GET /api/boot)" = "200" ] || fail "GET /api/boot did not answer 200"
[ "$(json_field state)" = "ready" ] || fail "/api/boot state is '$(json_field state)', want ready"
[ -n "$(json_field label)" ] || fail "/api/boot reports no label"

docker compose exec instance-1 su - candidate -c 'kubectl get nodes --no-headers' | tee /tmp/nodes.txt
[ "$(grep -c ' Ready ' /tmp/nodes.txt)" -eq 2 ] || fail "expected 2 Ready nodes"

echo "== cluster add-ons: enforcing CNI, ingress controller, helm repo, registry =="
docker compose exec k8s-env kubectl -n kube-system get daemonset calico-node >/dev/null 2>&1 \
  || fail "calico-node is missing — NetworkPolicy would not be enforced"
docker compose exec k8s-env kubectl -n kube-system get daemonset kindnet >/dev/null 2>&1 \
  && fail "kindnet is still installed; disableDefaultCNI should have removed it" || true

docker compose exec -T k8s-env sh <<'PROBE'
set -e
kubectl create namespace netpol-smoke --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n netpol-smoke run target --image=nginx:1.29-alpine --labels=app=target \
  --port=80 >/dev/null 2>&1 || true
kubectl -n netpol-smoke expose pod target --port=80 >/dev/null 2>&1 || true
kubectl -n netpol-smoke wait --for=condition=Ready pod/target --timeout=120s >/dev/null
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

ing_ok=0
for _ in $(seq 1 20); do
  if curl -fsS --max-time 5 -H 'Host: smoke.sim.local' http://localhost:8081/ | grep -q 'nginx'; then
    ing_ok=1; break
  fi
  sleep 3
done
[ "$ing_ok" = "1" ] || fail "Ingress did not answer on the published host port :8081"
docker compose exec k8s-env kubectl delete namespace ingress-smoke --wait=false >/dev/null

echo "== published ports bind loopback only (SIM_BIND default) =="
docker compose port facilitator 8080 | grep -q '^127\.0\.0\.1:' \
  || fail "facilitator should publish on 127.0.0.1 by default (SIM_BIND), got '$(docker compose port facilitator 8080)'"
docker compose port k8s-env 80 | grep -q '^127\.0\.0\.1:' \
  || fail "the ingress host port should publish on 127.0.0.1 by default (SIM_BIND), got '$(docker compose port k8s-env 80)'"

echo "== facilitator: healthz, exam metadata, built UI, desktop only via :8080 =="
status=$(req GET /healthz)
[ "$status" = "200" ] || fail "healthz expected 200, got $status"

status=$(req GET /api/exam)
[ "$status" = "200" ] || fail "/api/exam expected 200, got $status"
bank_title=$(grep -m1 -E '^[[:space:]]*title:' banks/ckad-mock-01/exam.yaml | sed -E 's/^[[:space:]]*title:[[:space:]]*//')
api_title=$(json_field title)
[ "$api_title" = "$bank_title" ] || fail "/api/exam title mismatch: bank='$bank_title' api='$api_title'"

declared=$(grep -m1 -E '^[[:space:]]*examLength:' banks/ckad-mock-01/exam.yaml | sed -E 's/.*:[[:space:]]*//')
pool=$(grep -cE '^[[:space:]]*- id: q' banks/ckad-mock-01/exam.yaml)
[ "$(json_field questionCount)" = "$declared" ] \
  || fail "/api/exam questionCount should be the declared ${declared}, got '$(json_field questionCount)'"
api_pool=$(RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    print(len(json.load(f).get("questions", [])))
')
[ "$api_pool" = "$pool" ] \
  || fail "/api/exam should list the whole ${pool}-question pool before an attempt, got ${api_pool}"

[ "$(json_field hasTips)" = "True" ] || fail "/api/exam hasTips should be True for ckad-mock-01"
[ "$(req GET /api/exam/tips)" = "200" ] || fail "/api/exam/tips should be 200 with no attempt running"
[ -n "$(json_field markdown)" ] || fail "/api/exam/tips returned an empty body"

status=$(req GET /)
grep -q 'assets/' "$RESP" || fail "exam UI '/' did not serve the built assets"

curl -fsS --max-time 5 -o /dev/null http://localhost:6080/vnc.html \
  && fail "port 6080 should not be reachable from the host (it would bypass the session gate)" || true

status=$(req GET /desktop/vnc.html)
[ "$status" = "403" ] || fail "desktop should be 403 while idle, got $status"

status=$(req GET /api/questions/q01/solution)
[ "$status" = "403" ] || fail "solution should be 403 before the session ends, got $status"

docker compose exec desktop curl -fsS --max-time 15 -o /dev/null -x http://docs-proxy:3128 https://kubernetes.io \
  || fail "proxy should allow kubernetes.io"
docker compose exec desktop curl -fs --max-time 15 -o /dev/null -x http://docs-proxy:3128 https://example.com \
  && fail "proxy should block example.com" || true
docker compose exec desktop curl -fsS --max-time 15 -o /dev/null -x http://docs-proxy:3128 https://code.jquery.com/jquery-3.7.1.min.js \
  || fail "proxy should allow code.jquery.com (kubernetes.io docs depend on it)"
docker compose exec desktop curl -fs --max-time 15 -o /dev/null -x http://docs-proxy:3128 https://www.googletagmanager.com \
  && fail "proxy should still block analytics" || true
docker compose exec desktop curl -fs --max-time 15 -o /dev/null -x http://docs-proxy:3128 https://www.google.com \
  && fail "proxy should still block open web search (kubernetes.io falls back to its own Pagefind index)" || true
docker compose exec desktop grep -q '^MiscShowUnsafePasteDialog=FALSE' \
  /home/candidate/.config/xfce4/terminal/terminalrc \
  || fail "terminal unsafe-paste dialog is not disabled"
docker compose exec desktop curl -s --max-time 5 -o /dev/null https://example.com \
  && fail "desktop should have no direct egress" || true
docker compose exec desktop su - candidate -c 'ssh -o BatchMode=yes instance-1 kubectl get nodes --no-headers' \
  | grep -q ' Ready ' || fail "desktop->instance-1 ssh broken"

docker compose exec desktop pgrep -f "xfce4-terminal" >/dev/null \
  || fail "desktop should auto-open the exam terminal"
docker compose exec desktop cat /shared/exam/motd | grep -q 'ssh instance-1' \
  || fail "desktop motd should list the ssh targets"

curl -fsS --max-time 5 -o /dev/null http://localhost:9000/healthz \
  && fail "conductor should not be reachable from the host" || true
docker compose exec desktop curl -fs --max-time 5 -o /dev/null http://conductor:9000/healthz \
  && fail "conductor should not be reachable from the desktop" || true
status=$(req GET /api/control/status)
[ "$status" = "200" ] || fail "/api/control/status expected 200 via :8080, got $status"

SMOKE_PREPARE_BUDGET=${SMOKE_PREPARE_BUDGET:-900}

start_session() {
  local code job elapsed=0 interval=2 state perr
  if [ "$#" -gt 0 ]; then
    code=$(curl -s -o "$RESP" -w '%{http_code}' -X POST \
      -H 'Content-Type: application/json' -d "$1" "${BASE}/api/session/start")
  else
    code=$(req POST /api/session/start)
  fi

  if [ "$code" != "202" ]; then

    [ "$code" = "200" ] || echo "  session start: HTTP ${code}: $(json_field error 2>/dev/null || true)" >&2
    printf '%s' "$code"
    return 0
  fi

  job=$(json_field jobId)
  echo "  session start: 202 — preparing $(json_field questionCount) question(s) as job ${job} (budget ${SMOKE_PREPARE_BUDGET}s)" >&2

  while [ "$elapsed" -lt "$SMOKE_PREPARE_BUDGET" ]; do
    if [ "$(req GET /api/session)" = "200" ] && [ -z "$(json_field preparing)" ]; then

      state=$(json_field state)
      if [ "$state" = "running" ]; then
        printf '200'
        return 0
      fi
      perr=$(json_field prepareError)
      if [ -n "$perr" ]; then
        echo "  session start: job ${job} could not prepare the environment: ${perr}" >&2
      else
        echo "  session start: job ${job} cleared with the session '${state}' and no prepareError (cancelled, or the facilitator restarted mid-preparation)" >&2
      fi
      printf '%s' "$code"
      return 0
    fi
    sleep "$interval"; elapsed=$((elapsed + interval))
  done

  echo "  session start: job ${job} did not finish preparing within ${SMOKE_PREPARE_BUDGET}s" >&2
  echo "    that job is the thing to look at: curl -s ${BASE}/api/control/status; curl -s ${BASE}/api/control/log" >&2
  echo "    raise the budget with SMOKE_PREPARE_BUDGET=<seconds> bash tests/smoke.sh" >&2
  printf '%s' "$code"
  return 0
}

echo "== session lifecycle: start, countdown, desktop unlock =="
status=$(start_session)
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

gated_qid=$(drawn_qid)
status=$(req GET /api/questions/${gated_qid}/solution)
[ "$status" = "403" ] || fail "solution should still be 403 while the session is running, got $status"

./sim grade | tee /tmp/grade0.txt
read -r _ e0 t0 _ < <(grep '^RESULT ' /tmp/grade0.txt)
[ "$e0" = "0" ] || fail "fresh env should score 0, got ${e0}"

wait_workloads() {

  local budget=300 elapsed=0 unsettled stable=0
  while [ "$elapsed" -lt "$budget" ]; do
    unsettled=$(docker compose exec -T k8s-env kubectl get pods --all-namespaces \
      --no-headers 2>/dev/null \
      | awk '$4=="Unknown" || $4=="Pending" || $4=="ContainerCreating" || $4=="PodInitializing" {print $1"/"$2}' \
      | tr '\n' ' ')
    if [ -z "${unsettled// /}" ]; then

      stable=$((stable + 1))
      [ "$stable" -ge 2 ] && break
    else
      stable=0
    fi
    sleep 5; elapsed=$((elapsed + 5))
  done
  [ "$stable" -ge 2 ] || fail "pods still unsettled after ${budget}s: ${unsettled}"

  docker compose exec -T k8s-env kubectl wait --for=condition=Available \
    deployments --all --all-namespaces --timeout=300s >/dev/null 2>&1 \
    || fail "cluster workloads did not become Available within 300s"
}

solve_bank() {
  local bank=$1 qid inst drawn=0
  [ "$(req GET /api/exam)" = "200" ] || { fail "solve: GET /api/exam did not answer 200"; return; }
  [ "$(json_field name)" = "$bank" ] \
    || { fail "solve: the loaded exam is '$(json_field name)', want ${bank}"; return; }
  while read -r qid inst; do
    [ -n "$qid" ] || continue
    drawn=$((drawn + 1))
    [ -f "tests/solutions/${bank}/${qid}.sh" ] \
      || { fail "no solution script for ${bank}/${qid}"; continue; }

    docker compose exec -T "$inst" su - candidate \
      -c "bash /tests/solutions/${bank}/${qid}.sh" \
      >"/tmp/smoke-${bank}-${qid}.log" 2>&1 </dev/null \
      || fail "${bank}/${qid} solution failed (see /tmp/smoke-${bank}-${qid}.log)"
  done < <(RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
for q in data.get("questions", []):
    print(q["id"], q.get("instance", "instance-1"))
')
  echo "  solved ${drawn} drawn question(s) of ${bank}"
  [ "$drawn" -gt 0 ] || fail "solve: the attempt drew no questions at all"
}

# A pooled bank asks a different subset every attempt, so "the questions this
# attempt drew all have a solution" proves nothing about the next one: the
# whole pool needs a script or some future draw fails with no warning. Which
# banks are pooled is derived, not named — a bank is pooled when it declares
# spec.examLength and that length is smaller than its pool (the same rule
# tests/bank-weights.sh applies), and mcq banks are skipped because their
# answers live in exam.yaml rather than in tests/solutions/.
pooled_banks() {
  local f bank len size
  for f in banks/*/exam.yaml; do
    [ -f "$f" ] || continue
    bank=$(basename "$(dirname "$f")")
    grep -qE '^[[:space:]]*examType:[[:space:]]*mcq[[:space:]]*$' "$f" && continue
    len=$(grep -m1 -E '^[[:space:]]*examLength:' "$f" | sed -E 's/.*:[[:space:]]*//' | tr -d '\r')
    case ${len:-} in ''|*[!0-9]*) continue ;; esac
    size=$(grep -cE '^[[:space:]]*- id: q' "$f")
    [ "$len" -gt 0 ] && [ "$len" -lt "$size" ] || continue
    printf '%s\n' "$bank"
  done
}

pooled_seen=0
while read -r pbank; do
  [ -n "$pbank" ] || continue
  pooled_seen=$((pooled_seen + 1))
  missing=$(docker compose exec -T k8s-env yq -r '.spec.questions[].id' \
    "/banks/${pbank}/exam.yaml" | tr -d '\r' \
    | while read -r qid; do
        [ -n "$qid" ] || continue
        [ -f "tests/solutions/${pbank}/${qid}.sh" ] || printf '%s ' "$qid"
      done)
  [ -z "$missing" ] || fail "${pbank} pool questions with no solution script: ${missing}"
done < <(pooled_banks)
[ "$pooled_seen" -gt 0 ] \
  || fail "pooled_banks() detected no pooled bank at all — the detection is broken, and every pool-completeness assertion above it silently checked nothing"

[ "$(req GET /api/exam)" = "200" ] || fail "GET /api/exam did not answer 200 during the attempt"
drawn_ids=$(RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    print(" ".join(q["id"] for q in json.load(f).get("questions", [])))
')
drawn_n=$(printf '%s' "$drawn_ids" | wc -w | tr -d ' ')
[ "$drawn_n" = "$declared" ] \
  || fail "a running attempt should ask the declared ${declared} of ${pool}, got ${drawn_n}"

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

  if [ "$earned" != "$t1" ]; then
    fail "facilitator results: earned should be ${t1}, got ${earned}"
    echo "  checks the facilitator scored as failed:"

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

status=$(req GET /api/questions/${gated_qid}/solution)
[ "$status" = "200" ] || fail "solution should be 200 once the session has ended, got $status"

status=$(req GET /desktop/vnc.html)
[ "$status" = "403" ] || fail "desktop should be 403 once the session has ended, got $status"

./sim down
./sim up ckad-mock-01
wait_workloads
./sim grade | tee /tmp/grade2.txt
read -r _ e2 t2 _ < <(grep '^RESULT ' /tmp/grade2.txt)
[ "$e2" = "$t2" ] || fail "resumed env should keep score ${t2}/${t2}, got ${e2}/${t2}"
[ "$t2" = "$t1" ] || fail "resumed attempt is worth ${t2}, the attempt that ended was worth ${t1}"

status=$(req DELETE /api/session)
[ "$status" = "204" ] || fail "DELETE /api/session expected 204, got $status"

status=$(req GET /api/session)
state=$(json_field state)
[ "$state" = "idle" ] || fail "session should be idle right after DELETE, got $state"

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

# A coming-soon bank and an id nothing has ever heard of are both refused with
# 400, so the status code alone cannot tell the two cases apart: this fixture
# named cka-mock, cka-mock left banks/catalog.yaml, and the assertion went on
# passing as a second unknown-id test with the coming-soon path unexercised.
# The reason string is what distinguishes them, so both are asserted.
curl -s -o "$RESP" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"bank":"cks-mock"}' http://localhost:8080/api/control/switch > /tmp/smoke-cs.txt
[ "$(cat /tmp/smoke-cs.txt)" = "400" ] \
  || fail "switch to a coming-soon bank should be 400, got $(cat /tmp/smoke-cs.txt)"
grep -q 'cannot be activated' "$RESP" \
  || fail "switch to cks-mock should be refused as a coming-soon bank ('cannot be activated'); if it is refused as unknown, cks-mock has left banks/catalog.yaml and this fixture is no longer testing the coming-soon path: $(cat "$RESP")"

curl -s -o "$RESP" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"bank":"no-such-bank"}' http://localhost:8080/api/control/switch > /tmp/smoke-unk.txt
[ "$(cat /tmp/smoke-unk.txt)" = "400" ] \
  || fail "switch to an unknown bank id should be 400, got $(cat /tmp/smoke-unk.txt)"
grep -q 'unknown bank' "$RESP" \
  || fail "switch to an unknown bank id should say so: $(cat "$RESP")"

curl -s -o "$RESP" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"bank":"../../etc"}' http://localhost:8080/api/control/switch > /tmp/smoke-tr.txt
[ "$(cat /tmp/smoke-tr.txt)" = "400" ] \
  || fail "switch to a traversal id should be 400, got $(cat /tmp/smoke-tr.txt)"

curl -fsS -X POST -H 'Content-Type: application/json' -d '{"bank":"smoke-01"}' \
  http://localhost:8080/api/control/switch >/dev/null || fail "switch to smoke-01 not accepted"
wait_control

status=$(req GET /api/exam)
api_name=$(json_field name)
[ "$api_name" = "smoke-01" ] || fail "active exam should be smoke-01, got $api_name"
docker compose exec desktop cat /shared/exam/motd | grep -q 'Smoke Test Bank' \
  || fail "desktop motd should mention the smoke bank after the switch"

status=$(req GET /api/control/banks)
[ "$status" = "200" ] || fail "/api/control/banks expected 200, got $status"
listed=$(RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
print(",".join(b.get("id", "") for b in data.get("banks", [])))
' 2>/dev/null) || fail "could not parse /api/control/banks"
case ",${listed}," in
  *,smoke-01,*) fail "smoke-01 is a test fixture and must not appear in the bank list (got: ${listed})" ;;
esac
case ",${listed}," in
  *,ckad-mock-01,*) : ;;
  *) fail "the bank list should still offer ckad-mock-01 (got: ${listed})" ;;
esac

./sim grade | tee /tmp/grade-smoke0.txt
read -r _ se0 _ _ < <(grep '^RESULT ' /tmp/grade-smoke0.txt)
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

# The CKAD lifecycle above proves fresh-scores-0 -> solve the drawn questions
# -> full marks for one hands-on pool, wound through the session, results and
# resume assertions it also carries. Every other hands-on pool needs the same
# proof, and needs it without a second copy of those assertions: switching
# banks rebuilds the cluster, so this runs once per bank, on top of the bank
# the switch section has already left active.
solve_cycle() {
  local bank=$1 declared pool drawn_n status e t
  echo "== ${bank}: switch, fresh scores 0, the drawn attempt solves to full marks =="
  curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"bank\":\"${bank}\"}" \
    http://localhost:8080/api/control/switch >/dev/null \
    || { fail "switch to ${bank} not accepted"; return; }
  wait_control

  [ "$(req GET /api/exam)" = "200" ] || { fail "${bank}: /api/exam did not answer 200"; return; }
  [ "$(json_field name)" = "$bank" ] \
    || { fail "${bank}: the active exam is '$(json_field name)'"; return; }

  declared=$(grep -m1 -E '^[[:space:]]*examLength:' "banks/${bank}/exam.yaml" | sed -E 's/.*:[[:space:]]*//')
  pool=$(grep -cE '^[[:space:]]*- id: q' "banks/${bank}/exam.yaml")
  [ "$(json_field questionCount)" = "$declared" ] \
    || fail "${bank}: /api/exam questionCount should be the declared ${declared}, got '$(json_field questionCount)'"

  status=$(start_session)
  [ "$status" = "200" ] || { fail "${bank}: session start expected 200, got $status"; return; }

  ./sim grade | tee "/tmp/grade-${bank}-fresh.txt"
  read -r _ e t _ < <(grep '^RESULT ' "/tmp/grade-${bank}-fresh.txt")
  [ "$e" = "0" ] || fail "${bank}: a fresh environment should score 0, got ${e}"
  # A bank whose graders all fall over scores 0 out of 0 and would sail through
  # the line above.
  [ "${t:-0}" -gt 0 ] 2>/dev/null \
    || fail "${bank}: the drawn attempt is worth ${t:-no} points — nothing was drawn, or no check declares any"

  [ "$(req GET /api/exam)" = "200" ] || fail "${bank}: /api/exam did not answer 200 during the attempt"
  drawn_n=$(RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    print(len(json.load(f).get("questions", [])))
')
  [ "$drawn_n" = "$declared" ] \
    || fail "${bank}: a running attempt should ask the declared ${declared} of ${pool}, got ${drawn_n}"

  solve_bank "$bank"

  ./sim grade | tee "/tmp/grade-${bank}-solved.txt"
  read -r _ e t _ < <(grep '^RESULT ' "/tmp/grade-${bank}-solved.txt")
  [ "$e" = "$t" ] || fail "${bank}: a solved environment should score ${t}/${t}, got ${e}/${t}"

  status=$(req DELETE /api/session)
  [ "$status" = "204" ] || fail "${bank}: cleanup DELETE expected 204, got $status"
}

solve_cycle cka-mock-01

echo "== mcq: kcna-mock — switch, blank/partial/full grades, answer gates =="
curl -fsS -X POST -H 'Content-Type: application/json' -d '{"bank":"kcna-mock"}' \
  http://localhost:8080/api/control/switch >/dev/null || fail "mcq: switch to kcna-mock not accepted"
wait_control

status=$(req GET /api/exam)
[ "$status" = "200" ] || fail "mcq: /api/exam expected 200, got $status"
[ "$(json_field name)" = "kcna-mock" ] || fail "mcq: active exam should be kcna-mock, got '$(json_field name)'"
[ "$(json_field examType)" = "mcq" ] || fail "mcq: examType should be mcq, got '$(json_field examType)'"
[ "$(json_field questionCount)" = "65" ] \
  || fail "mcq: /api/exam questionCount should be 65 (the draw length), got '$(json_field questionCount)'"
poolcount=$(RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
print(len(data.get("questions", [])))
')
[ "$poolcount" = "97" ] || fail "mcq: /api/exam should list the full 97-question pool before any attempt starts, got ${poolcount}"

docker compose exec -T k8s-env yq -o=json '.spec.questions' /banks/kcna-mock/exam.yaml \
  | tr -d '\r' > /tmp/smoke-mcq-key.json \
  || fail "mcq: could not read the kcna-mock question list from k8s-env"

wait_mcq_results() {
  local budget=60 interval=2 elapsed=0 rstatus=""
  while [ "$elapsed" -lt "$budget" ]; do
    rstatus=$(req GET /api/results)
    [ "$rstatus" = "200" ] && return 0
    sleep "$interval"; elapsed=$((elapsed + interval))
  done
  fail "mcq: /api/results did not reach 200 within ${budget}s (last status ${rstatus})"
  return 1
}

current_exam_ids() {
  RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
for q in data.get("questions", []):
    print(q["id"])
'
}

first_multi_in_current_exam() {
  RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
for q in data.get("questions", []):
    if q.get("multi"):
        print(q["id"])
        break
'
}

status=$(start_session)
[ "$status" = "200" ] || fail "mcq: blank start expected 200, got $status"
status=$(req POST /api/session/end)
[ "$status" = "202" ] || fail "mcq: blank end expected 202, got $status"
if wait_mcq_results; then
  [ "$(json_field percent)" = "0" ] || fail "mcq: blank attempt percent should be 0, got '$(json_field percent)'"
  [ "$(json_field passed)" = "False" ] || fail "mcq: blank attempt must not pass, got '$(json_field passed)'"
fi
status=$(req DELETE /api/session)
[ "$status" = "204" ] || fail "mcq: blank cleanup DELETE expected 204, got $status"

mq=""
mq_start_failed=0
for _ in $(seq 1 30); do
  status=$(start_session)

  if [ "$status" != "200" ]; then
    fail "mcq: partial start expected 200, got $status"
    mq_start_failed=1
    break
  fi
  status=$(req GET /api/exam)
  [ "$status" = "200" ] || fail "mcq: /api/exam expected 200, got $status"
  mq=$(first_multi_in_current_exam)
  [ -n "$mq" ] && break
  status=$(req DELETE /api/session)
  [ "$status" = "204" ] || fail "mcq: partial retry cleanup DELETE expected 204, got $status"
done
if [ "$mq_start_failed" = "1" ]; then

  :
elif [ -z "$mq" ]; then
  fail "mcq: no multi-select question landed in 30 pooled draws — check the pool still has enough multi questions"
else
  mcorrect=$(MQ="$mq" python3 -c '
import json, os
qs = json.load(open("/tmp/smoke-mcq-key.json"))
q = next(q for q in qs if q["id"] == os.environ["MQ"])
print(",".join(str(i) for i in q["correct"]))
')

  status=$(req GET /api/questions/"$mq")
  [ "$status" = "200" ] || fail "mcq: GET /api/questions/$mq expected 200, got $status"
  grep -q '"correct"' "$RESP" && fail "mcq: GET /api/questions/$mq leaks the answer key" || true
  status=$(req GET /api/questions/"$mq"/solution)
  [ "$status" = "403" ] || fail "mcq: explanation should be 403 mid-exam, got $status"

  partial=${mcorrect%,*}
  curl -s -o "$RESP" -w '%{http_code}' -X PUT -H 'Content-Type: application/json' \
    -d "{\"selected\":[${partial}]}" "${BASE}/api/questions/${mq}/answer" > /tmp/smoke-mcq-put.txt
  [ "$(cat /tmp/smoke-mcq-put.txt)" = "200" ] \
    || fail "mcq: partial PUT expected 200, got $(cat /tmp/smoke-mcq-put.txt)"

  status=$(req POST /api/session/end)
  [ "$status" = "202" ] || fail "mcq: partial end expected 202, got $status"

  curl -s -o "$RESP" -w '%{http_code}' -X PUT -H 'Content-Type: application/json' \
    -d "{\"selected\":[${partial}]}" "${BASE}/api/questions/${mq}/answer" > /tmp/smoke-mcq-late.txt
  [ "$(cat /tmp/smoke-mcq-late.txt)" = "409" ] \
    || fail "mcq: a PUT after end should be 409, got $(cat /tmp/smoke-mcq-late.txt)"

  if wait_mcq_results; then
    mearned=$(RESP="$RESP" MQ="$mq" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
for q in data.get("questions", []):
    if q.get("id") == os.environ["MQ"]:
        print(q.get("earned", ""))
')
    [ "$mearned" = "0" ] \
      || fail "mcq: all-or-nothing — ${mq} with a partial selection should earn 0, got '${mearned}'"
  fi
  status=$(req DELETE /api/session)
  [ "$status" = "204" ] || fail "mcq: partial cleanup DELETE expected 204, got $status"
fi

status=$(start_session)
[ "$status" = "200" ] || fail "mcq: full start expected 200, got $status"
status=$(req GET /api/exam)
[ "$status" = "200" ] || fail "mcq: /api/exam expected 200, got $status"
current_exam_ids > /tmp/smoke-mcq-drawn-ids.txt
drawn_count=$(wc -l < /tmp/smoke-mcq-drawn-ids.txt | tr -d ' ')
[ "$drawn_count" = "65" ] || fail "mcq: this attempt drew ${drawn_count} questions, want 65"
fmq=$(first_multi_in_current_exam)

put_bad=0
while IFS=$'\t' read -r qid key; do
  [ -n "$qid" ] || continue
  code=$(curl -s -o "$RESP" -w '%{http_code}' -X PUT -H 'Content-Type: application/json' \
    -d "{\"selected\":${key}}" "${BASE}/api/questions/${qid}/answer")
  [ "$code" = "200" ] || { put_bad=$((put_bad+1)); echo "  mcq: PUT ${qid} answer got ${code}"; }
done < <(DRAWN=/tmp/smoke-mcq-drawn-ids.txt python3 -c '
import json, os
drawn = {line.strip() for line in open(os.environ["DRAWN"]) if line.strip()}
for q in json.load(open("/tmp/smoke-mcq-key.json")):
    if q["id"] in drawn:
        print(q["id"] + "\t" + json.dumps(q["correct"]))
')
[ "$put_bad" -eq 0 ] || fail "mcq: ${put_bad} answer PUT(s) did not return 200"

if [ -n "${fmq:-}" ]; then
  fmcorrect=$(MQ="$fmq" python3 -c '
import json, os
qs = json.load(open("/tmp/smoke-mcq-key.json"))
q = next(q for q in qs if q["id"] == os.environ["MQ"])
print(",".join(str(i) for i in q["correct"]))
')
  rev=$(python3 -c "print(sorted([${fmcorrect}], reverse=True))")
  curl -s -o "$RESP" -w '%{http_code}' -X PUT -H 'Content-Type: application/json' \
    -d "{\"selected\":${rev}}" "${BASE}/api/questions/${fmq}/answer" > /tmp/smoke-mcq-echo.txt
  [ "$(cat /tmp/smoke-mcq-echo.txt)" = "200" ] \
    || fail "mcq: reversed PUT expected 200, got $(cat /tmp/smoke-mcq-echo.txt)"
  want=$(python3 -c "print(sorted([${fmcorrect}]))")
  [ "$(json_field selected)" = "$want" ] \
    || fail "mcq: PUT should echo the sorted selection ${want}, got '$(json_field selected)'"
fi

status=$(req POST /api/session/end)
[ "$status" = "202" ] || fail "mcq: full end expected 202, got $status"
if wait_mcq_results; then
  [ "$(json_field percent)" = "100" ] || fail "mcq: full-key percent should be 100, got '$(json_field percent)'"
  [ "$(json_field passed)" = "True" ] || fail "mcq: full-key attempt should pass, got '$(json_field passed)'"
  gcount=$(RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
print(len(data.get("questions", [])))
')
  [ "$gcount" = "65" ] || fail "mcq: graded question count should be 65 (the drawn subset), got ${gcount}"
fi
status=$(req DELETE /api/session)
[ "$status" = "204" ] || fail "mcq: full cleanup DELETE expected 204, got $status"

curl -fsS -X POST -H 'Content-Type: application/json' -d '{"bank":"ckad-mock-01"}' \
  http://localhost:8080/api/control/switch >/dev/null || fail "mcq: switch back to ckad-mock-01 not accepted"
wait_control
status=$(req GET /api/exam)
[ "$(json_field name)" = "ckad-mock-01" ] || fail "mcq: active exam should be back to ckad-mock-01, got '$(json_field name)'"

echo "== training mode: hints, solutions mid-attempt, scoring without ending =="
status=$(req DELETE /api/session)
[ "$status" = "204" ] || fail "training: could not reset the session, got $status"

status=$(start_session '{"mode":"training"}')
[ "$status" = "200" ] || fail "training: start expected 200, got $status"
[ "$(json_field mode)" = "training" ] || fail "training: mode is '$(json_field mode)'"
[ "$(json_field untimed)" = "True" ] || fail "training: untimed is '$(json_field untimed)', want True"
training_seed=$(json_field seed)
[ -n "$training_seed" ] || fail "training: the attempt reported no seed"

training_qid=$(drawn_qid)
[ "$(req GET /api/questions/${training_qid}/hints/1)" = "200" ] || fail "training: hint 1 not served"
[ -n "$(json_field markdown)" ] || fail "training: hint 1 is empty"
[ "$(req GET /api/questions/${training_qid}/hints/99)" = "404" ] || fail "training: out-of-range hint should 404"

[ "$(req GET /api/questions/${training_qid}/solution)" = "200" ] \
  || fail "training: solutions should be readable during a training attempt"

[ "$(req POST /api/session/grade)" = "200" ] || fail "training: mid-attempt grade failed"
[ "$(req GET /api/session)" = "200" ] && [ "$(json_field state)" = "running" ] \
  || fail "training: scoring must not end the attempt"
[ "$(req GET /api/results)" = "409" ] \
  || fail "training: a practice grade must not be recorded as a result"

curl -s -o "$RESP" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"question\":\"${training_qid}\"}" "${BASE}/api/control/reseed" > /tmp/smoke-reseed.txt
[ "$(cat /tmp/smoke-reseed.txt)" = "200" ] \
  || fail "training: reseed expected 200, got $(cat /tmp/smoke-reseed.txt)"
curl -s -o "$RESP" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"question":"../../etc"}' "${BASE}/api/control/reseed" > /tmp/smoke-reseed-bad.txt
[ "$(cat /tmp/smoke-reseed-bad.txt)" = "400" ] \
  || fail "training: a traversal question id should be 400, got $(cat /tmp/smoke-reseed-bad.txt)"

status=$(req DELETE /api/session)
[ "$status" = "204" ] || fail "training: cleanup DELETE expected 204, got $status"

status=$(start_session "{\"seed\":\"${training_seed}\"}")
[ "$status" = "200" ] || fail "exam-gate: start expected 200, got $status"
[ "$(json_field seed)" = "$training_seed" ] \
  || fail "exam-gate: replayed seed ${training_seed}, got '$(json_field seed)'"
if [ "$status" = "200" ]; then
  [ "$(json_field mode)" = "exam" ] || fail "exam-gate: mode is '$(json_field mode)', want exam"
  exam_qid=$(drawn_qid)
  [ "$(req GET /api/questions/${exam_qid}/hints/1)" = "403" ] || fail "exam-gate: hints must be 403 in an exam"
  [ "$(req GET /api/questions/${exam_qid}/solution)" = "403" ] || fail "exam-gate: solutions must be 403 mid-exam"

  [ "$(req GET /api/exam/tips)" = "200" ] || fail "exam-gate: tips must stay readable mid-exam"
  [ "$(req POST /api/session/grade)" = "403" ] || fail "exam-gate: mid-attempt scoring must be 403 in an exam"
  curl -s -o "$RESP" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    -d "{\"question\":\"${exam_qid}\"}" "${BASE}/api/control/reseed" > /tmp/smoke-reseed-exam.txt
  [ "$(cat /tmp/smoke-reseed-exam.txt)" = "403" ] \
    || fail "exam-gate: reseed must be 403 in an exam, got $(cat /tmp/smoke-reseed-exam.txt)"
fi
status=$(req DELETE /api/session)
[ "$status" = "204" ] || fail "exam-gate: cleanup DELETE expected 204, got $status"

echo "== auto-end: session expires unattended and re-locks the desktop =="
./sim reset
status=$(req GET /api/session)
[ "$(json_field state)" = "idle" ] || fail "auto-end: session should be idle after the reset"

SESSION_DURATION_OVERRIDE=20s docker compose up -d --wait facilitator
status=$(start_session)
[ "$status" = "200" ] || fail "auto-end: session start expected 200, got $status"

sleep 25

status=$(req GET /api/session)
[ "$status" = "200" ] || fail "auto-end: /api/session expected 200, got $status"
state=$(json_field state)
reason=$(json_field endReason)
[ "$state" = "ended" ] || fail "auto-end: session should be ended after expiry, got $state"
[ "$reason" = "expired" ] || fail "auto-end: endReason should be expired, got $reason"

status=$(req GET /desktop/vnc.html)
[ "$status" = "403" ] || fail "auto-end: desktop should be 403 after expiry, got $status"

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
