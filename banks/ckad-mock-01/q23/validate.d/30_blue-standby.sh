#!/usr/bin/env bash
# points: 1
# desc: the cutover left blue standing at full strength as the rollback
set -uo pipefail
. /banks/_lib/checks.sh

# Both halves, and the second one is not decoration. "blue is still
# running" is true before the candidate touches anything, so on its own
# this would be a point every fresh environment scores — which is exactly
# what the smoke suite's "a fresh environment scores 0" assertion exists
# to catch. What is being graded is the CUTOVER having been made without
# dismantling the rollback, and that is only a state a correct answer
# reaches.
want=$(kubectl -n lacerta get deploy checkout-blue -o jsonpath='{.spec.replicas}' 2>/dev/null)
[ -n "$want" ] || {
  echo "Deployment checkout-blue is gone"
  show_why "The point of blue/green over a rolling update is that the previous release is still standing: rollback is one selector edit, with no image to re-pull and no Pods to reschedule. Deleting blue after the cutover throws that away and leaves an ordinary, slower rollback."
  exit 1
}

ready=$(kubectl -n lacerta get deploy checkout-blue -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ -n "$ready" ] || ready=0
[ "$want" -ge 2 ] && [ "$ready" = "$want" ] || {
  echo "checkout-blue has ${ready}/${want} replicas ready, want 2/2"
  show_actual text "$(kubectl -n lacerta get deploy checkout-blue -o wide 2>/dev/null)"
  show_why "Scaling blue to zero costs the same as deleting it: the rollback is no longer instant, because the Pods have to be scheduled and started again before the selector can be moved back."
  exit 1
}

# Standby means "not receiving traffic". While the Service still matches
# blue's Pods, blue is the live release and there is no rollback to be
# ready for.
pods_for() {
  kubectl -n lacerta get pods -l "$1" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null | sort
}
sel=$(kubectl -n lacerta get svc checkout -o json 2>/dev/null \
  | jq -r '.spec.selector // {} | to_entries | map("\(.key)=\(.value)") | sort | join(",")')
blue=$(pods_for "app=checkout,release=blue")
matched=""
[ -n "$sel" ] && matched=$(pods_for "$sel")

for pod in $blue; do
  case "
$matched
" in
    *"
$pod
"*)
      echo "the Service still sends traffic to the blue release, so nothing is on standby"
      show_actual text "$(printf 'selector: %s\nmatches:\n%s\n\nblue release Pods:\n%s\n' "$sel" "$matched" "$blue")"
      show_why "Blue is the rollback only once green is the one being served. Until the selector moves, blue IS the release — and a selector that matches both is worse than either, because it silently splits live traffic across two versions."
      exit 1 ;;
  esac
done

echo "blue is warm and on standby, ready to roll back to"
