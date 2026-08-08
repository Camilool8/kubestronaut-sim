#!/usr/bin/env bash
# points: 2
# desc: the rollout finished and the Pods now serving have stopped restarting
set -uo pipefail
. /banks/_lib/checks.sh

# Restarts do not "stop" — the Pods carrying them are replaced. So this counts
# only the Pods that already have the corrected probe, which is exactly the set
# the new ReplicaSet owns. Anything still draining from the old one is excluded
# rather than waited for, because a check has thirty seconds and no right to
# spend them sleeping.
repaired=$(kubectl -n horologium get pod -l app=session-store -o json 2>/dev/null | jq '
  [.items[]
   | select(.metadata.deletionTimestamp == null)
   | select(any(.spec.containers[];
       .name == "store" and (.livenessProbe.httpGet.port == 80 or .livenessProbe.httpGet.port == "80")))]')
live=$(printf '%s' "$repaired" | jq 'length // 0')
worst=$(printf '%s' "$repaired" | jq '[.[] | .status.containerStatuses[]? | .restartCount] | max // 0')

ready=$(kubectl -n horologium get deploy session-store -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
want=$(kubectl -n horologium get deploy session-store -o jsonpath='{.spec.replicas}' 2>/dev/null)
[ -n "$ready" ] || ready=0
[ -n "$want" ] || want=0

list_pane() {
  show_actual text "$(kubectl -n horologium get pod -l app=session-store 2>/dev/null)"
  show_why "$1"
}
detail_pane() {
  show_actual json "$(printf '%s' "$repaired" | jq '[.[] | {name: .metadata.name,
    phase: .status.phase,
    restarts: [.status.containerStatuses[]? | .restartCount],
    lastState: [.status.containerStatuses[]? | .lastState]}]')"
  show_why "$1"
}
pane=''

rolled_out() { [ "$want" = "2" ] && [ "$ready" = "2" ]; }
quiet() { [ "${live:-0}" -ge 2 ] && [ "${worst:-1}" = "0" ]; }

crit 1 "both replicas are ready" \
  "${ready}/${want} replicas are ready" \
  "A Pod being killed by its liveness probe still reports Ready between kills, so readiness alone was never the symptom here — the replica count is the other half of the pair. If this is short, the rollout has not finished or the new Pods are failing for a second reason." \
  -- rolled_out || pane=${pane:-list_pane}

crit 1 "the Pods now serving show no restarts" \
  "${live} Pod(s) carry the corrected probe and the worst restart count among them is ${worst}, want 0" \
  "Editing the Pod template starts a rollout, so the Pods whose restart counts were climbing are deleted rather than repaired, and their replacements begin at zero. A replacement that is itself restarting means the probe still cannot reach the container: read the new Pods' events the same way, since the address in the message is the fastest way to see what it is dialling now." \
  -- quiet || pane=${pane:-detail_pane}

crit_all_passed || "${pane:-list_pane}" "$(crit_why)"
report "restarts stopped"
