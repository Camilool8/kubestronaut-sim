#!/usr/bin/env bash
# points: 1
# desc: the cutover left blue standing at full strength as the rollback
set -uo pipefail
. /banks/_lib/checks.sh

want=$(kubectl -n lacerta get deploy checkout-blue -o jsonpath='{.spec.replicas}' 2>/dev/null)
[ -n "$want" ] || {
  echo "Deployment checkout-blue is gone"
  show_why "The point of blue/green over a rolling update is that the previous release is still standing: rollback is one selector edit, with no image to re-pull and no Pods to reschedule. Deleting blue after the cutover throws that away and leaves an ordinary, slower rollback."
  exit 1
}

ready=$(kubectl -n lacerta get deploy checkout-blue -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ -n "$ready" ] || ready=0

pods_for() {
  kubectl -n lacerta get pods -l "$1" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null | sort
}
sel=$(kubectl -n lacerta get svc checkout -o json 2>/dev/null \
  | jq -r '.spec.selector // {} | to_entries | map("\(.key)=\(.value)") | sort | join(",")')
blue=$(pods_for "app=checkout,release=blue")
matched=""
[ -n "$sel" ] && matched=$(pods_for "$sel")

at_full_strength() { [ "$want" -ge 2 ] && [ "$ready" = "$want" ]; }
off_the_service() {
  local pod
  for pod in $blue; do
    case "
$matched
" in
      *"
$pod
"*) return 1 ;;
    esac
  done
  return 0
}

deploy_pane() {
  show_actual text "$(kubectl -n lacerta get deploy checkout-blue -o wide 2>/dev/null)"
  show_why "$1"
}
sel_pane() {
  show_actual text "$(printf 'selector: %s\nmatches:\n%s\n\nblue release Pods:\n%s\n' "$sel" "$matched" "$blue")"
  show_why "$1"
}
pane=''

crit 1 "blue is still at full strength" \
  "checkout-blue has ${ready}/${want} replicas ready, want 2/2" \
  "Scaling blue to zero costs the same as deleting it: the rollback is no longer instant, because the Pods have to be scheduled and started again before the selector can be moved back." \
  -- at_full_strength || pane=${pane:-deploy_pane}

crit 1 "and takes no traffic" \
  "the Service still sends traffic to the blue release, so nothing is on standby" \
  "Blue is the rollback only once green is the one being served. Until the selector moves, blue IS the release — and a selector that matches both is worse than either, because it silently splits live traffic across two versions." \
  -- off_the_service || pane=${pane:-sel_pane}

crit_all_passed || "${pane:-deploy_pane}" "$(crit_why)"
report "blue is warm and on standby, ready to roll back to"
