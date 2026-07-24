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
docker compose exec ckad-1 su - candidate -c 'kubectl get nodes --no-headers' | tee /tmp/nodes.txt
[ "$(grep -c ' Ready ' /tmp/nodes.txt)" -eq 2 ] || fail "expected 2 Ready nodes"

echo "== facilitator: healthz, exam metadata, built UI, single :8080 surface =="
status=$(req GET /healthz)
[ "$status" = "200" ] || fail "healthz expected 200, got $status"

status=$(req GET /api/exam)
[ "$status" = "200" ] || fail "/api/exam expected 200, got $status"
bank_title=$(grep -m1 -E '^[[:space:]]*title:' banks/ckad-mock-01/exam.yaml | sed -E 's/^[[:space:]]*title:[[:space:]]*//')
api_title=$(json_field title)
[ "$api_title" = "$bank_title" ] || fail "/api/exam title mismatch: bank='$bank_title' api='$api_title'"

status=$(req GET /)
grep -q 'assets/' "$RESP" || fail "exam UI '/' did not serve the built assets"

curl -fsS --max-time 5 -o /dev/null http://localhost:6080/vnc.html \
  && fail "port 6080 should not be reachable from the host (single :8080 surface)" || true

status=$(req GET /desktop/vnc.html)
[ "$status" = "403" ] || fail "desktop should be 403 while idle, got $status"

status=$(req GET /api/questions/q01/solution)
[ "$status" = "403" ] || fail "solution should be 403 before the session ends, got $status"

# desktop container itself: proxy allowlist enforced; no direct egress; ssh to instances works
docker compose exec desktop curl -fsS --max-time 15 -o /dev/null -x http://docs-proxy:3128 https://kubernetes.io \
  || fail "proxy should allow kubernetes.io"
docker compose exec desktop curl -fs --max-time 15 -o /dev/null -x http://docs-proxy:3128 https://example.com \
  && fail "proxy should block example.com" || true
docker compose exec desktop curl -s --max-time 5 -o /dev/null https://example.com \
  && fail "desktop should have no direct egress" || true
docker compose exec desktop su - candidate -c 'ssh -o BatchMode=yes ckad-1 kubectl get nodes --no-headers' \
  | grep -q ' Ready ' || fail "desktop->ckad-1 ssh broken"

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

docker compose exec ckad-1 su - candidate -c 'bash /tests/solutions/q01.sh'
docker compose exec ckad-1 su - candidate -c 'bash /tests/solutions/q02.sh'
docker compose exec ckad-2 su - candidate -c 'bash /tests/solutions/q03.sh'

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
  [ "$earned" = "17" ] || fail "facilitator results: earned should be 17, got ${earned}"
  [ "$total" = "17" ] || fail "facilitator results: total should be 17, got ${total}"
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
./sim grade | tee /tmp/grade2.txt
read -r _ e2 t2 _ < <(grep '^RESULT ' /tmp/grade2.txt)
[ "$e2" = "$t2" ] || fail "resumed env should keep score ${t2}/${t2}, got ${e2}/${t2}"

# reset: fresh exam state, /opt/course dirs re-created empty, session cleared too
./sim reset
./sim grade | tee /tmp/grade3.txt
read -r _ e3 _ _ < <(grep '^RESULT ' /tmp/grade3.txt)
[ "$e3" = "0" ] || fail "reset env should score 0, got ${e3}"
docker compose exec ckad-1 su - candidate -c 'test -d /opt/course/1 -a -w /opt/course/1 -a -z "$(ls -A /opt/course/1)"' \
  || fail "reset should leave /opt/course/1 empty and writable"

status=$(req GET /api/session)
state=$(json_field state)
[ "$state" = "idle" ] || fail "session should be idle after ./sim reset, got $state"

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
