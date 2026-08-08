#!/usr/bin/env bash
# points: 2
# desc: the Service selects exactly the green release's Pods and still publishes port 80
set -uo pipefail
. /banks/_lib/checks.sh

evidence() {
  show_actual yaml "$(kubectl -n lacerta get svc checkout -o yaml 2>/dev/null | k8s_clean)"
  show_expected yaml "/banks/${BANK:-ckad-mock-01}/q23/expected/service.yaml"
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

match_pane() {
  show_actual text "$(printf 'selector: %s\nmatches:\n%s\n\ngreen release Pods:\n%s\n' "$sel" "$matched" "$green")"
  show_why "$1"
}
pane=''

crit 2 "selects exactly the green release's Pods" \
  "selector '$sel' matches $(printf '%s\n' "$matched" | grep -c . || true) Pod(s), want exactly the $(printf '%s\n' "$green" | grep -c .) green one(s)" \
  "A Service routes to every Pod its labels match and has no other opinion about them, so 'switch the release' means 'change which labels the selector names'. Matching both releases at once is the failure worth knowing: it does not error, it silently load-balances across the two versions." \
  -- same_set "$matched" "$green" || pane=${pane:-match_pane}

crit 1 "still publishes port 80" \
  "the Service no longer publishes port 80" \
  "Clients hold the Service's name and port, not its selector, so a cutover that changes the published port has broken every caller in exchange for the release it was meant to deliver invisibly." \
  -- [ "$port" = "80" ] || pane=${pane:-evidence}

crit_all_passed || "${pane:-evidence}" "$(crit_why)"
report "selector cut over to green"
