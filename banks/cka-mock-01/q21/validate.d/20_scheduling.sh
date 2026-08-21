#!/usr/bin/env bash
# points: 2
# desc: batch-runner's Pod template tolerates the batch taint and requires the workload=batch label with no node pinned
# expected: scheduling.json json
set -uo pipefail
. /banks/_lib/checks.sh

NS=octans
DEP=batch-runner

name=$(kubectl -n "$NS" get deploy "$DEP" -o jsonpath='{.metadata.name}' 2>/dev/null)

# Only the four fields that decide placement. The whole Pod template would bury
# them, and the question is about nothing else here.
tpl=$(kubectl -n "$NS" get deploy "$DEP" -o json 2>/dev/null \
  | jq -S '.spec.template.spec
        | {nodeName, nodeSelector, tolerations, nodeAffinity: .affinity.nodeAffinity}' 2>/dev/null)

snapshot() {
  printf '%s' "${tpl:-null}"
}

evidence() {
  show_pair json scheduling.json
  show_why "$1"
}

[ -n "$name" ] || {
  echo "no Deployment $DEP in Namespace $NS"
  show_actual text "$(kubectl -n "$NS" get deploy 2>/dev/null)"
  show_why "This check reads the Pod template of Deployment $DEP in Namespace $NS, and the pane above lists what that Namespace holds. Both halves graded here belong on the template — spec.template.spec — not on a Pod: fields set on a running Pod are thrown away the moment the ReplicaSet replaces it, and a Deployment recreated under another name is invisible to every check in this question."
  exit 1
}

# Toleration matching as the scheduler does it, not as a string. An empty
# effect tolerates every effect of the key, Exists tolerates every value, and an
# empty key with Exists tolerates everything there is — all three are legitimate
# answers here, and grading the spelling of the seeded-solution form would fail
# them.
tol=$(printf '%s' "${tpl:-null}" | jq -r '
  [ .tolerations[]?
    | select( (.effect // "") == "" or (.effect // "") == "NoSchedule" )
    | select( ( (.key // "") == "" and (.operator // "Equal") == "Exists" )
              or ( (.key // "") == "workload"
                   and ( (.operator // "Equal") == "Exists"
                         or ( (.operator // "Equal") == "Equal"
                              and (.value // "") == "batch" ) ) ) )
  ] | length' 2>/dev/null)
case ${tol:-} in
  ''|*[!0-9]*) tol=0 ;;
esac

# Required means required: a nodeSelector, or a required node affinity whose
# EVERY term asks for the label. Terms are OR-ed, so one term without the
# constraint leaves the Pod free to land anywhere.
requires=$(printf '%s' "${tpl:-null}" | jq -r '
  if (.nodeSelector.workload // "") == "batch" then "yes"
  else
    ( [ .nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[]?
        | [ .matchExpressions[]?
            | select(.key == "workload")
            | select( ( .operator == "In"
                        and ( (.values // []) | index("batch") ) != null )
                      or .operator == "Exists" ) ]
        | length ] ) as $terms
    | if ($terms | length) > 0 and ($terms | all(. > 0)) then "yes" else "no" end
  end' 2>/dev/null)

pinned=$(printf '%s' "${tpl:-null}" | jq -r '
  [ (.nodeName // empty),
    (.nodeSelector["kubernetes.io/hostname"] // empty),
    ( .nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[]?
      | (.matchExpressions[]?, .matchFields[]?)
      | select(.key == "kubernetes.io/hostname" or .key == "metadata.name")
      | ((.values // []) | join(",")) )
  ] | join(" ")' 2>/dev/null)

tolerates() { [ "${tol:-0}" -ge 1 ]; }
by_label_only() { [ "$requires" = yes ] && [ -z "$pinned" ]; }

crit 1 "the Pod template tolerates workload=batch:NoSchedule" \
  "no toleration in the template matches workload=batch:NoSchedule" \
  "A taint is refused by default: with no matching toleration the scheduler will not place this Pod on the reserved node at all, whatever its affinity says, and the Pods sit Pending with 'had untolerated taint' in their events. The toleration is a list entry under spec.template.spec.tolerations — key workload, operator Equal, value batch, effect NoSchedule is the explicit form, and 'kubectl explain pod.spec.tolerations' names every field. Tolerating a taint is permission, never preference: it lets this Pod onto the node and does nothing to keep it off the others." \
  -- tolerates

crit 1 "the template requires the workload=batch label and names no node" \
  "requires the workload=batch label: $requires; node names still in the template: ${pinned:-none}" \
  "These are the two halves of 'must land there'. The requirement is a nodeSelector of workload=batch, or a requiredDuringSchedulingIgnoredDuringExecution node affinity matching that label — preferredDuringScheduling only tilts the score and lets the Pod go elsewhere when the reserved node is busy, which is why the question rules it out. The hostname pin has to go with it: nodeSelector entries and node affinity terms are AND-ed, so a template that still names sim-worker AND asks for the batch label describes a node that does not exist and the Pods stay Pending forever. Remove the pin rather than pointing it at sim-worker2 — naming a node hard-codes the answer to one machine, which is the arrangement this question replaces." \
  -- by_label_only

crit_all_passed || evidence "$(crit_why)"
report "batch-runner asks for the batch node"
