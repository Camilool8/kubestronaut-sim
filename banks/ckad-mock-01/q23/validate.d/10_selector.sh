#!/usr/bin/env bash
# points: 2
# desc: the Service selects exactly the green release's Pods and still publishes port 80
# expected: service.yaml yaml
set -uo pipefail
. /banks/_lib/checks.sh

# Only the Service's own authored fields — selector and the published port —
# go into the pane. Which live Pods that selector actually resolves to is a
# name list with a random suffix on every one, the same reason an
# EndpointSlice never gets an authored document (docs/bank-spec.md); it is
# read only to accept the selector, and its detail rides on the crit message
# and match_pane below instead. 30_blue-standby.sh grades the same Service and
# shares this document rather than declaring its own.
snapshot() {
  kubectl -n lacerta get svc checkout -o json 2>/dev/null | jq -S '
    {selector: (.spec.selector // {}),
     port: ((.spec.ports[]? | select(.port == 80) | .port) // null)}' \
    | yq -p json -o yaml -P 2>/dev/null
}

evidence() {
  show_pair yaml service.yaml
  show_why "$1"
}

sel=$(kubectl -n lacerta get svc checkout -o json 2>/dev/null \
  | jq -r '.spec.selector // {} | to_entries | map("\(.key)=\(.value)") | sort | join(",")')
[ -n "$sel" ] || {
  echo "Service checkout has no selector"
  evidence "A Service with no spec.selector matches nothing and is never given endpoints by the controller — the cutover has to move the selector, not remove it. If the Service is gone entirely, recreate it rather than routing around it: the question is about the switch, and the Service IS the switch."
  exit 1
}

pods_for() {
  kubectl -n lacerta get pods -l "$1" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null | sort
}
matched=$(pods_for "$sel")
green=$(pods_for "app=checkout,release=green")

[ -n "$green" ] || {
  echo "the green release has no Pods running, so nothing can be cut over to it"
  show_why "checkout-green is part of the pre-seeded state rather than part of the answer. If its Pods are gone, restore the Deployment — 'kubectl -n lacerta rollout status deploy/checkout-green' says what happened to them."
  exit 1
}

port=$(kubectl -n lacerta get svc checkout \
  -o jsonpath='{.spec.ports[?(@.port==80)].port}' 2>/dev/null)

# The question rules this one out: the Service was to be left publishing port
# 80, so a cutover that moves the port is not a partial answer to anything. It
# is also true of a Service nobody touched, which is why it is a gate and not a
# criterion — respecting it earns nothing.
[ "$port" = "80" ] || {
  echo "the Service no longer publishes port 80"
  evidence "The question ruled this out: the Service was to keep publishing port 80, and it no longer does. Clients hold the Service's name and port, not its selector, so a cutover that changes the published port has broken every caller in exchange for a release that was meant to reach them invisibly. Deleting the Service and writing a new one is the usual way to lose it — patch the selector on the Service that is there instead."
  exit 1
}

match_pane() {
  show_actual text "$(printf 'selector: %s\nmatches:\n%s\n\ngreen release Pods:\n%s\n' "$sel" "$matched" "$green")"
  show_why "$1"
}
pane=''

crit 2 "selects exactly the green release's Pods" \
  "selector '$sel' matches $(printf '%s\n' "$matched" | grep -c . || true) Pod(s), want exactly the $(printf '%s\n' "$green" | grep -c .) green one(s)" \
  "A Service routes to every Pod its labels match and has no other opinion about them, so 'switch the release' means 'change which labels the selector names'. Matching both releases at once is the failure worth knowing: it does not error, it silently load-balances across the two versions." \
  -- same_set "$matched" "$green" || pane=${pane:-match_pane}

crit_all_passed || "${pane:-evidence}" "$(crit_why)"
report "selector cut over to green"
