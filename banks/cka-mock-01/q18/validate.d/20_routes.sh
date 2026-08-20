#!/usr/bin/env bash
# points: 4
# desc: the controller really routes /api to api-ok and /web to web-ok for host q18-phoenix.sim.local
set -uo pipefail
. /banks/_lib/checks.sh

host=q18-phoenix.sim.local

ip=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.spec.clusterIP}' 2>/dev/null)
[ -n "$ip" ] || {
  echo "could not find the ingress controller's address"
  show_actual text "$(kubectl -n ingress-nginx get svc 2>/dev/null)"
  show_why "The ingress-nginx controller Service reported no cluster address, so there is nowhere to send a request. That is a property of the cluster rather than of the answer."
  exit 1
}

ready=$(kubectl -n phoenix get deploy api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
have_client() { [ -n "$ready" ] && [ "$ready" -ge 1 ] 2>/dev/null; }
have_client || {
  echo "no ready Pod of Deployment api to send the requests from"
  show_actual text "$(kubectl -n phoenix get deploy,pod 2>/dev/null)"
  show_why "The two requests are made from inside the cluster, from a Pod this question seeded, because the controller's address is a ClusterIP and is reachable from nowhere else. Deployment api has no ready Pod to run them in — it was seeded and was not yours to change, and without it neither route can be observed."
  exit 1
}

# One exec for both paths: two round trips of kubectl exec would spend most of
# the check's 30s budget on the connections rather than on the requests. Each
# curl is bounded well inside that budget because a request the controller has
# no rule for still answers — it is a request to a wrong BACKEND that hangs.
probe() {
  kubectl -n phoenix exec deploy/api -- sh -c \
    "printf 'api-path: '; curl -s -m 3 -H 'Host: ${host}' 'http://${ip}/api';
     printf '\nweb-path: '; curl -s -m 3 -H 'Host: ${host}' 'http://${ip}/web'; echo" 2>/dev/null
}

answered() { printf '%s\n' "$out" | grep -m1 "^$1" | grep -q "$2"; }
routed() { answered 'api-path:' 'api-ok' && answered 'web-path:' 'web-ok'; }

# The controller reloads its configuration a moment after the Ingress is
# admitted, so one retry separates "not done" from "done a second ago".
out=$(probe)
routed || {
  sleep 3
  out=$(probe)
}

evidence() {
  show_actual text "$(printf 'what the controller answered:\n%s\n\nphoenix:\n%s\n' \
    "$(printf '%s\n' "$out" | head -c 1200)" \
    "$(kubectl -n phoenix get ingress,svc,endpointslice 2>/dev/null)")"
  show_why "$1"
}

# The two paths fail for their own reasons — a rule the controller never
# admitted takes both, a wrong port or Service takes one — so they are scored
# separately.
crit 2 "/api reaches the api backend" \
  "http://${host}/api answered '$(printf '%s\n' "$out" | grep -m1 '^api-path:' | head -c 120)', want api-ok" \
  "The request went to the controller carrying q18-phoenix.sim.local as its name and did not come back from api. An Ingress the controller never admitted looks exactly like one that works — the object exists, the rules read correctly and nothing routes — and a class matching no IngressClass is the usual cause; the ADDRESS column stays empty when no controller has claimed the object. A 404 page instead of the word means the request did arrive and no rule claimed it, which is the host or the path. The word web-ok means the rule claimed it and sent it to the other Service." \
  -- answered 'api-path:' 'api-ok'

crit 2 "/web reaches the web backend" \
  "http://${host}/web answered '$(printf '%s\n' "$out" | grep -m1 '^web-path:' | head -c 120)', want web-ok" \
  "If /api reached api then the controller has admitted this Ingress and only the second rule is not doing its job: its path, its pathType, or the Service and port it names. ingress-nginx picks the longest matching prefix regardless of the order the paths are listed in, so a rule that never fires is not being shadowed by the other one. Note that the two Services listen on ports of their own — 8080 and 80 — and a backend port that no Service port matches leaves the controller with no endpoint to forward to, which it answers as a 503." \
  -- answered 'web-path:' 'web-ok'

crit_all_passed || evidence "$(crit_why)"
report "both paths routed"
