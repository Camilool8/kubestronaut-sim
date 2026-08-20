#!/usr/bin/env bash
# Every question in a pooled bank, drawn, solved and graded to full marks.
#
# tests/smoke.sh proves one attempt of a pooled bank: it solves the 16 or 17
# questions that attempt happened to draw and stops there. The other 10 or 27
# are never executed, so a question whose setup.sh, solution or grader is
# broken ships green and only fails for a candidate, months later, on the draw
# that finally picks it.
#
# The domain filter is what makes full coverage cheap. exam.Draw returns the
# WHOLE in-scope set whenever the draw length is not smaller than it
# (facilitator/internal/exam/exam.go:565-572), and every domain of a bank this
# size holds fewer questions than the bank's examLength — so one filtered
# attempt per domain draws that domain entire, and five attempts cover a
# 26-question pool. Where a domain is deeper than the draw length the loop just
# keeps drawing fresh seeds until the union covers it, or gives up loudly.
#
# Domain-filtered attempts are excluded from the recorded history
# (facilitator/internal/history/record.go:48-53), and training mode grades
# without ending the attempt, so the sweep leaves no attempt in the candidate's
# stats and needs no submit/reset cycle per question.
#
# This is a separate script rather than another section of smoke.sh because it
# is run on demand and repeatedly — after a question's grader changes, before a
# release, once per bank — while smoke is one linear pass that must be run
# whole. It also runs against whichever bank is already active, so it can be
# pointed at a bank without paying for a cluster rebuild first.
#
# Usage:
#   bash tests/drill.sh [bank-id]        # default cka-mock-01
#
#   DRILL_BASE              facilitator URL           (default http://localhost:8080)
#   DRILL_PREPARE_BUDGET    seconds to wait for per-question seeding (default 900)
#   DRILL_ATTEMPT_LIMIT     attempts per domain before giving up      (default 12)
#   DRILL_RESET             0 => skip the ./sim reset before each attempt (default 1)
#
# Exit status: 0 when every pool question was drawn, solved and graded to full
# marks; 1 otherwise, with the reason per question. It never exits 0 with
# questions unaccounted for, and every loop is bounded — a bank that refuses to
# draw an id fails at the attempt limit rather than spinning.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BANK=${1:-${DRILL_BANK:-cka-mock-01}}
BASE=${DRILL_BASE:-http://localhost:8080}
PREPARE_BUDGET=${DRILL_PREPARE_BUDGET:-900}
ATTEMPT_LIMIT=${DRILL_ATTEMPT_LIMIT:-12}
# On by default, because without it the sweep can only ever finish its first
# domain. The facilitator remembers which ids the environment was seeded for
# and refuses a start whose draw differs (errClusterHoldsAnotherDraw,
# facilitator/internal/api/prepare.go) — correctly, since the cluster still
# holds the previous draw's objects. Ending the session does not clear that;
# only a rebuild does. So every attempt after the first answers 409 until
# something resets, and the reset is also what makes each attempt's grade a
# real fresh-environment measurement rather than a reading taken on top of the
# last domain's solved state.
RESET_EACH=${DRILL_RESET:-1}

RESP=/tmp/drill-http.json
STATE=/tmp/drill-state-${BANK}.tsv   # qid <TAB> verdict <TAB> detail

FAILURES=0
fail() { echo "DRILL FAIL: $1"; FAILURES=$((FAILURES + 1)); }
say() { echo "== $*"; }

req() { curl -s -o "$RESP" -w '%{http_code}' -X "$1" "${BASE}$2"; }

post_json() { curl -s -o "$RESP" -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -d "$2" "${BASE}$1"; }

jf() {
  RESP="$RESP" FIELD="$1" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
print(data.get(os.environ["FIELD"], ""))
' 2>/dev/null
}

seed() { python3 -c 'import secrets; print(secrets.token_hex(3))'; }

# ---------------------------------------------------------------- preflight

for tool in curl python3 docker; do
  command -v "$tool" >/dev/null 2>&1 \
    || { echo "DRILL FAIL: ${tool} is not on PATH"; exit 1; }
done

[ -f "banks/${BANK}/exam.yaml" ] \
  || { echo "DRILL FAIL: banks/${BANK}/exam.yaml does not exist"; exit 1; }

if [ "$(req GET /api/exam)" != "200" ]; then
  echo "DRILL FAIL: GET ${BASE}/api/exam did not answer 200 — bring the stack up first: ./sim up ${BANK}"
  exit 1
fi
active=$(jf name)
if [ "$active" != "$BANK" ]; then
  echo "DRILL FAIL: the active bank is '${active}', not ${BANK}."
  echo "  switch first: curl -fsS -X POST -H 'Content-Type: application/json' \\"
  echo "    -d '{\"bank\":\"${BANK}\"}' ${BASE}/api/control/switch"
  exit 1
fi

req GET /api/session >/dev/null
sstate=$(jf state)
case $sstate in
  idle) ;;
  ended)
    echo "  a finished attempt was still loaded; clearing it"
    [ "$(req DELETE /api/session)" = "204" ] \
      || { echo "DRILL FAIL: could not clear the ended attempt"; exit 1; } ;;
  *)
    echo "DRILL FAIL: an attempt is '${sstate}' — the drill starts its own attempts."
    echo "  clear it first: curl -s -X DELETE ${BASE}/api/session"
    exit 1 ;;
esac

# ------------------------------------------------------------- the pool

# With no attempt running /api/exam lists the whole pool, which is the only
# place the drill can learn the full id set from. Reading it from exam.yaml
# instead would let the bank and the server disagree without the drill noticing.
[ "$(req GET /api/exam)" = "200" ] || { echo "DRILL FAIL: /api/exam stopped answering"; exit 1; }
cp "$RESP" /tmp/drill-pool.json

pool_rows=$(python3 -c '
import json
data = json.load(open("/tmp/drill-pool.json"))
for q in data.get("questions", []):
    print("\t".join([q["id"], q.get("domain", ""), q.get("instance", "instance-1")]))
')
if [ -z "$pool_rows" ]; then
  echo "DRILL FAIL: /api/exam listed no questions — is an attempt running?"
  exit 1
fi
pool_n=$(printf '%s\n' "$pool_rows" | wc -l | tr -d ' ')

domains=$(python3 -c '
import json
data = json.load(open("/tmp/drill-pool.json"))
seen = []
for d in data.get("domains", []):
    if d.get("name"):
        seen.append(d["name"])
for q in data.get("questions", []):
    if q.get("domain") and q["domain"] not in seen:
        seen.append(q["domain"])
print("\n".join(seen))
')
[ -n "$domains" ] || { echo "DRILL FAIL: /api/exam declares no domains to filter on"; exit 1; }

# qid <TAB> domain <TAB> verdict <TAB> detail. The domain keeps its own column
# so a verdict written later cannot overwrite the thing the sweep loops on.
: > "$STATE"
while IFS=$'\t' read -r qid dom _; do
  [ -n "$qid" ] || continue
  if [ -f "tests/solutions/${BANK}/${qid}.sh" ]; then
    printf '%s\t%s\tPENDING\t\n' "$qid" "$dom" >> "$STATE"
  else
    printf '%s\t%s\tNOSCRIPT\ttests/solutions/%s/%s.sh does not exist\n' \
      "$qid" "$dom" "$BANK" "$qid" >> "$STATE"
  fi
done <<< "$pool_rows"

verdict() { awk -F'\t' -v q="$1" '$1 == q {print $3}' "$STATE"; }

mark() { # qid verdict detail
  python3 - "$STATE" "$1" "$2" "${3:-}" <<'PY'
import sys
path, qid, verdict, detail = sys.argv[1:5]
rows = [l.rstrip("\n").split("\t") for l in open(path) if l.strip()]
for r in rows:
    while len(r) < 4:
        r.append("")
    if r[0] == qid:
        r[2], r[3] = verdict, detail
with open(path, "w") as f:
    for r in rows:
        f.write("\t".join(r) + "\n")
PY
}

pending_in_domain() { awk -F'\t' -v d="$1" '$2 == d && $3 == "PENDING" {print $1}' "$STATE"; }

echo "drill: ${BANK} — ${pool_n} pool questions across $(printf '%s\n' "$domains" | wc -l | tr -d ' ') domain(s)"
missing=$(awk -F'\t' '$3 == "NOSCRIPT" {printf "%s ", $1}' "$STATE")
[ -z "$missing" ] || fail "${BANK} questions with no solution script: ${missing}"

# --------------------------------------------------------- attempt driver

start_attempt() { # domain seed -> echoes the http status the attempt reached
  local body code job elapsed=0 state perr
  body=$(DOM="$1" SEED="$2" python3 -c '
import json, os
print(json.dumps({"mode": "training",
                  "domains": [os.environ["DOM"]],
                  "seed": os.environ["SEED"]}))
')
  code=$(post_json /api/session/start "$body")
  if [ "$code" != "202" ]; then
    [ "$code" = "200" ] || echo "  start: HTTP ${code}: $(jf error)" >&2
    printf '%s' "$code"
    return 0
  fi

  job=$(jf jobId)
  echo "  start: 202 — seeding $(jf questionCount) question(s) as job ${job} (budget ${PREPARE_BUDGET}s)" >&2
  while [ "$elapsed" -lt "$PREPARE_BUDGET" ]; do
    if [ "$(req GET /api/session)" = "200" ] && [ -z "$(jf preparing)" ]; then
      state=$(jf state)
      if [ "$state" = "running" ]; then
        printf '200'
        return 0
      fi
      perr=$(jf prepareError)
      echo "  start: job ${job} ended '${state}': ${perr:-no prepareError reported}" >&2
      printf '%s' "$code"
      return 0
    fi
    sleep 2; elapsed=$((elapsed + 2))
  done
  echo "  start: job ${job} did not finish seeding within ${PREPARE_BUDGET}s" >&2
  echo "    raise it with DRILL_PREPARE_BUDGET=<seconds>, and read ${BASE}/api/control/log" >&2
  printf '%s' "$code"
  return 0
}

drawn_rows() { # id <TAB> instance for the attempt that is open now
  [ "$(req GET /api/exam)" = "200" ] || return 1
  RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
for q in data.get("questions", []):
    print(q["id"] + "\t" + q.get("instance", "instance-1"))
'
}

grade_rows() { # id <TAB> earned <TAB> total <TAB> first failing check, from a training grade
  [ "$(req POST /api/session/grade)" = "200" ] || return 1
  RESP="$RESP" python3 -c '
import json, os
with open(os.environ["RESP"]) as f:
    data = json.load(f)
for q in data.get("questions", []):
    why = ""
    for c in q.get("checks", []):
        if c.get("passed"):
            continue
        msg = (c.get("message") or "").replace("\t", " ").splitlines()
        why = "%s: %s" % (c.get("desc", ""), msg[0] if msg else "no message")
        break
    print("\t".join([q.get("id", ""), str(q.get("earned", 0)),
                     str(q.get("total", 0)), why]))
'
}

solve() { # qid instance -> 0 when the solution script ran clean
  local qid=$1 inst=$2
  local log="/tmp/drill-${BANK}-${qid}.log"
  docker compose exec -T "$inst" su - candidate \
    -c "bash /tests/solutions/${BANK}/${qid}.sh" >"$log" 2>&1 </dev/null
}

run_attempt() { # domain -> solves and grades one filtered attempt
  local dom=$1 sd code rows qid inst earned total why
  sd=$(seed)
  echo "  attempt: domain '${dom}' seed ${sd}"

  if [ "$RESET_EACH" = "1" ]; then
    ./sim reset >/dev/null 2>&1 || fail "./sim reset failed before a '${dom}' attempt"
  fi

  code=$(start_attempt "$dom" "$sd")
  if [ "$code" != "200" ]; then
    fail "${dom}: attempt (seed ${sd}) did not start: HTTP ${code}"
    req DELETE /api/session >/dev/null
    return 1
  fi

  rows=$(drawn_rows) || { fail "${dom}: /api/exam did not answer during the attempt"; req DELETE /api/session >/dev/null; return 1; }
  if [ -z "$rows" ]; then
    fail "${dom}: the attempt drew no questions at all"
    req DELETE /api/session >/dev/null
    return 1
  fi

  while IFS=$'\t' read -r qid inst; do
    [ -n "$qid" ] || continue
    if [ ! -f "tests/solutions/${BANK}/${qid}.sh" ]; then
      mark "$qid" NOSCRIPT "tests/solutions/${BANK}/${qid}.sh does not exist"
      continue
    fi
    if ! solve "$qid" "$inst"; then
      mark "$qid" SOLVEFAIL "solution exited non-zero on ${inst}; see /tmp/drill-${BANK}-${qid}.log"
    fi
  done <<< "$rows"

  local graded
  graded=$(grade_rows)
  if [ -z "$graded" ]; then
    fail "${dom}: POST /api/session/grade returned nothing — the attempt was solved but never scored"
    req DELETE /api/session >/dev/null
    return 1
  fi

  while IFS=$'\t' read -r qid earned total why; do
    [ -n "$qid" ] || continue
    if [ "${total:-0}" -le 0 ] 2>/dev/null; then
      mark "$qid" NOPOINTS "graded ${earned}/${total} — the question carries no points"
    elif [ "$earned" = "$total" ]; then
      # Full marks do not clear a missing or failed solution script: a question
      # can score full because an earlier attempt already solved it, and a
      # solution that exits non-zero is a defect even when the cluster ends up
      # right. Both stay on the report.
      case $(verdict "$qid") in
        NOSCRIPT|SOLVEFAIL) : ;;
        *) mark "$qid" OK "${earned}/${total}" ;;
      esac
    else
      mark "$qid" SHORT "${earned}/${total} — ${why}"
    fi
  done <<< "$graded"

  [ "$(req DELETE /api/session)" = "204" ] \
    || fail "${dom}: could not clear the attempt after grading"
  return 0
}

# ------------------------------------------------------------------ sweep

while IFS= read -r dom; do
  [ -n "$dom" ] || continue
  say "domain: ${dom}"
  tries=0
  while [ -n "$(pending_in_domain "$dom")" ]; do
    tries=$((tries + 1))
    if [ "$tries" -gt "$ATTEMPT_LIMIT" ]; then
      fail "${dom}: ${ATTEMPT_LIMIT} attempts never drew $(pending_in_domain "$dom" | tr '\n' ' ')— raise DRILL_ATTEMPT_LIMIT, or the draw cannot reach those ids"
      break
    fi
    run_attempt "$dom" || break
  done
done <<< "$domains"

# ----------------------------------------------------------------- report

echo
printf '%-6s %-10s %s\n' "QID" "VERDICT" "DETAIL"
while IFS=$'\t' read -r qid _ v detail; do
  [ -n "$qid" ] || continue
  printf '%-6s %-10s %s\n' "$qid" "$v" "$detail"
done < "$STATE"

bad=$(awk -F'\t' '$3 != "OK" {printf "%s(%s) ", $1, $3}' "$STATE")
ok_n=$(awk -F'\t' '$3 == "OK"' "$STATE" | wc -l | tr -d ' ')
[ -z "$bad" ] || fail "${BANK}: not every pool question reached full marks: ${bad}"

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "DRILL PASS: ${BANK} — ${ok_n}/${pool_n} pool questions drawn, solved and graded to full marks"
  exit 0
fi
echo "DRILL FAIL: ${BANK} — ${ok_n}/${pool_n} at full marks, ${FAILURES} failure(s)"
exit 1
