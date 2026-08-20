#!/usr/bin/env bash
# points: 3
# desc: a request through the Gateway carrying Host web.sim.internal really reaches dorado-web
set -uo pipefail
. /banks/_lib/checks.sh

# The one place this check learns where to send a request. The Gateway
# publishes its own address in status, which is the address of whatever the
# controller provisioned for it — read it from the Gateway rather than from the
# provisioned object, whose name belongs to the controller and not to any
# answer. jsonpath prints the whole list space-separated; take the first.
gw_address() {
  kubectl -n dorado get gateway dorado-gateway \
    -o jsonpath='{.status.addresses[*].value}' 2>/dev/null | awk '{print $1}'
}

addr=$(gw_address)
gw_list=$(kubectl -n dorado get gateway 2>/dev/null)

state() {
  show_actual text "$(printf 'gateways:\n%s\n\nhttproutes:\n%s\n\ndeployments:\n%s\n' \
    "${gw_list:-none}" \
    "$(kubectl -n dorado get httproute 2>/dev/null)" \
    "$(kubectl -n dorado get deploy 2>/dev/null)")"
}

[ -n "$addr" ] || {
  if [ -z "$gw_list" ]; then
    echo "no Gateway in namespace dorado, so there is no address to send a request to"
  else
    echo "the Gateway in dorado publishes no address in .status.addresses, so there is nowhere to send a request"
  fi
  state
  show_why "A Gateway's address is written by the controller once it has provisioned a data plane for the object, and an empty status.addresses means that has not happened: either no Gateway exists at all, or the one that does was never Programmed — a class name no controller serves is the usual cause. The deployments listed above include the one the controller provisions in this Namespace for a working Gateway; its absence and its 0/1 READY are two different problems."
  exit 1
}

# One exec, not two: every request has to fit inside this check's 30s budget
# alongside the retries. The data plane becomes Available a few seconds after
# the Gateway reports Programmed, so a single attempt is a coin toss on a
# correct answer — three attempts with -m 3 and a 2s pause is 15s at worst.
# -w prints the status code after the body, so one request answers both
# criteria: whether anything is listening, and what it sent back.
probe=$(kubectl -n dorado exec deploy/dorado-web -- sh -c '
  i=1
  out=""
  while [ "$i" -le 3 ]; do
    out=$(curl -s -m 3 -w "\nhttp_code=%{http_code}" -H "Host: web.sim.internal" "http://$1/" 2>/dev/null)
    case $out in
      *dorado-ok*) printf "%s\n" "$out"; exit 0 ;;
    esac
    i=$((i + 1))
    if [ "$i" -le 3 ]; then sleep 2; fi
  done
  printf "%s\n" "$out"' sh "$addr" 2>/dev/null)

code=$(printf '%s' "$probe" | sed -n 's/.*http_code=\([0-9][0-9]*\).*/\1/p' | tail -1)

listener_answers() { [ -n "$code" ] && [ "$code" != "000" ]; }
backend_answers() { case $probe in *dorado-ok*) return 0 ;; *) return 1 ;; esac; }

evidence() {
  state
  show_why "$1"
}

crit 1 "the listener on port 80 answers" \
  "no HTTP response came back from ${addr}:80 (curl reported status '${code:-none}')" \
  "This asks only whether something is listening, and it separates the two halves of the task: a status code of any value — 404 included — proves the Gateway's listener exists on port 80 and the proxy the controller provisioned is up, before anything about routing is considered. Nothing at all means one of three things: the listener is on another port, the data plane has not finished rolling out, or the address belongs to a Gateway that is no longer Programmed." \
  -- listener_answers

crit 2 "a request for web.sim.internal reaches dorado-web" \
  "the reply was not dorado-ok (status '${code:-none}', body: $(printf '%s' "$probe" | tr '\n' ' ' | head -c 120))" \
  "This is the whole question end to end: the request crosses the listener, the route's hostname match, its backendRef and the Service's own selector, so it succeeds only when every one of them is right. Read the status code before re-reading your YAML. 404 means the request arrived and no route claimed it — the Host header does not match the route's hostnames, or the route is not attached to this Gateway at all. 500 means a route claimed it and its backend did not resolve, which is the Service name or the port. Nothing coming back at all is the listener, not the route." \
  -- backend_answers

crit_all_passed || evidence "$(crit_why)"
report "gateway serves web.sim.internal"
