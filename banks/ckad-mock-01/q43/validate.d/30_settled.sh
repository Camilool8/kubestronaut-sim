#!/usr/bin/env bash
# points: 2
# desc: the rollout finished and the Pods now serving have stopped restarting
# expected: none — both criteria are live scheduling/restart readings taken at
#           a moment (how many Pods carry the corrected probe and are ready,
#           whether any of them are still churning through kills) rather than
#           a document the candidate authored. The messages already name the
#           counts and restart history seen.
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

# A restart count is not the signal it looks like: stopping and starting the
# whole stack restarts every container in the cluster once, and a candidate who
# repaired this probe an hour ago must not lose the points for it. What the
# seeded fault actually looks like is a container that never gets to run: the
# broken probe starts checking at five seconds and kills on its second failure
# three seconds later, so a container it is still failing never runs for more
# than about eleven seconds at a stretch, over and over. QUIET_FOR is nearly
# three times that, and no wait is involved — a Pod either already has a long
# run behind it or it does not.
QUIET_FOR=30
churning=$(printf '%s' "$repaired" | jq -r --argjson quiet "$QUIET_FOR" '
  [ .[]
    | {name: .metadata.name, cs: (.status.containerStatuses[]? | select(.name == "store"))}
    | {name,
       restarts: (.cs.restartCount // 0),
       run: ([ (.cs.state.running.startedAt // empty | now - fromdateiso8601)?,
               (.cs.lastState.terminated // empty
                | select(.startedAt != null and .finishedAt != null)
                | (.finishedAt | fromdateiso8601) - (.startedAt | fromdateiso8601))? ]
              | max // 0 | floor)}
    | select(.restarts > 0 and .run < $quiet)
    | "\(.name) (\(.restarts) restart(s), longest run \(.run)s)" ]
  | join(", ")')

ready=$(kubectl -n horologium get deploy session-store -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
want=$(kubectl -n horologium get deploy session-store -o jsonpath='{.spec.replicas}' 2>/dev/null)
[ -n "$ready" ] || ready=0
[ -n "$want" ] || want=0

if [ -n "$churning" ]; then
  churn_msg="Pod(s) carrying the corrected probe are still being restarted: ${churning}"
else
  churn_msg="${live} Pod(s) carry the corrected probe, want 2"
fi

list_pane() {
  show_actual text "$(kubectl -n horologium get pod -l app=session-store 2>/dev/null)"
  show_why "$1"
}
detail_pane() {
  show_actual json "$(printf '%s' "$repaired" | jq '[.[] | {name: .metadata.name,
    phase: .status.phase,
    restarts: [.status.containerStatuses[]? | .restartCount],
    state: [.status.containerStatuses[]? | .state],
    lastState: [.status.containerStatuses[]? | .lastState]}]')"
  show_why "$1"
}
pane=''

# A Pod being killed by liveness reports Ready between kills, so the seeded
# Deployment is already 2/2 and a bare readiness count is true of a Namespace
# nobody has touched. Both replicas being ready means something once the two
# that are ready are the ones carrying the corrected probe.
rolled_out() { [ "$want" = "2" ] && [ "$ready" = "2" ] && [ "${live:-0}" -ge 2 ]; }
quiet() { [ "${live:-0}" -ge 2 ] && [ -z "$churning" ]; }

crit 1 "both replicas are ready on the corrected probe" \
  "${ready}/${want} replicas are ready and ${live} Pod(s) carry the corrected probe, want 2 of each" \
  "A Pod being killed by its liveness probe still reports Ready between kills, so readiness alone was never the symptom here and it was already 2/2 before you started — the replica count is only half of the pair, and the Pods being counted have to be the repaired ones. If this is short, the rollout has not finished or the new Pods are failing for a second reason." \
  -- rolled_out || pane=${pane:-list_pane}

crit 1 "the Pods now serving are out of the restart loop" \
  "${churn_msg}" \
  "Editing the Pod template starts a rollout, so the Pods whose restart counts were climbing are deleted rather than repaired and their replacements begin at zero. This criterion does not demand that zero, because a restart count no longer tells a kill from a reboot: stopping and starting the whole environment restarts every container in the cluster once, through nobody's fault. What it asks instead is that no Pod carrying the corrected probe is still in the loop the broken one was in — that it has either never been restarted, or has a run behind it, the one it is in now or the one before it, longer than this probe would ever have allowed. A replacement that IS still being killed cannot have one: the probe cuts every run short at about eleven seconds. That also means this proves the probe is no longer failing, not that the container has never been restarted, and it cannot see a Pod that has only just been created either — nothing has had time to happen to it yet." \
  -- quiet || pane=${pane:-detail_pane}

crit_all_passed || "${pane:-list_pane}" "$(crit_why)"
report "restarts stopped"
