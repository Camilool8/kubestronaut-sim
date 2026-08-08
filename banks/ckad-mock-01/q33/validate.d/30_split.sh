#!/usr/bin/env bash
# points: 3
# desc: the untouched Service is backed by 5 ready endpoints, 1 of them canary
set -uo pipefail
. /banks/_lib/checks.sh

slices=$(kubectl -n lupus get endpointslice -l kubernetes.io/service-name=search -o json 2>/dev/null)
evidence() {
  show_actual json "$(printf '%s' "$slices" | jq '[.items[].endpoints[]? |
    {pod: .targetRef.name, ready: .conditions.ready}]')"
  show_why "$1"
}

sel=$(kubectl -n lupus get svc search -o json 2>/dev/null \
  | jq -r '.spec.selector // {} | to_entries | map("\(.key)=\(.value)") | sort | join(",")')
port=$(kubectl -n lupus get svc search -o jsonpath='{.spec.ports[?(@.port==80)].port}' 2>/dev/null)

[ -n "$sel" ] || {
  echo "Service search has no selector, so nothing is behind it"
  show_actual json "$(kubectl -n lupus get svc search -o json 2>/dev/null | jq '{spec: .spec.selector, ports: .spec.ports}')"
  show_why "The Service is the pre-seeded half of this question and the task says to leave it alone. It already selects on the one label both releases can share; a Service with no spec.selector is never given endpoints by the controller at all, so removing or replacing it takes the canary and the stable release offline together."
  exit 1
}

names=$(printf '%s' "$slices" | jq -r '.items[].endpoints[]? | select(.conditions.ready == true) | .targetRef.name // empty')
total=$(printf '%s\n' "$names" | grep -c . || true)
canary_pods=$(kubectl -n lupus get pods -l app=search,track=canary \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null)

canary=0
for n in $names; do
  has_name "$canary_pods" "$n" && canary=$((canary + 1))
done

crit 1 "the Service was left as it was" \
  "Service search no longer publishes port 80 (selector: $sel)" \
  "Clients hold the Service's name and port. A canary that changes either has broken every caller in exchange for a trial that was supposed to be invisible to them." \
  -- [ "$port" = "80" ]

crit 1 "5 Pods are behind it, as before" \
  "the Service has $total ready endpoint(s), want 5" \
  "Every ready Pod matching the selector lands in one flat endpoint list, and kube-proxy picks from it evenly. Six endpoints means the canary was added on top of the stable five instead of taking a share of them, which is both the wrong proportion and more capacity than the workload was sized for; fewer than five means Pods are still starting or the labels do not match." \
  -- [ "$total" = "5" ]

crit 1 "exactly one of them is the canary" \
  "$canary of the $total ready endpoints belong to track=canary Pods, want 1" \
  "This is the split itself, read off the object that decides it. Zero means the canary's Pods do not carry the label the Service selects on, so they are running and serving nobody. More than one means the counts do not divide the way the question asked." \
  -- [ "$canary" = "1" ]

crit_all_passed || evidence "$(crit_why)"
report "5 ready endpoints, 1 canary — one request in five"
