#!/usr/bin/env bash
# points: 3
# desc: shipper is a native sidecar — an initContainers entry with restartPolicy Always
# expected: sidecar.json json
set -uo pipefail
. /banks/_lib/checks.sh

ns=volans
dep=orders-api

# Both lists side by side, because the whole answer to this check is which list
# the entry is in and what one field on it says.
snapshot() {
  kubectl -n "$ns" get deploy "$dep" -o json 2>/dev/null \
    | jq -S '.spec.template.spec
          | {initContainers: [.initContainers[]? | {name, restartPolicy}],
             containers: [.containers[]? | {name}]}' 2>/dev/null
}

evidence() {
  show_pair json sidecar.json
  show_why "$1"
}

name=$(kubectl -n "$ns" get deploy "$dep" -o jsonpath='{.metadata.name}' 2>/dev/null)
[ -n "$name" ] || {
  echo "Deployment $dep not found in Namespace $ns"
  show_actual text "$(kubectl -n "$ns" get deploy 2>/dev/null)"
  show_why "Every criterion in this question is read off the Pod template of Deployment orders-api in Namespace volans, and the pane above lists what that Namespace actually holds. The sidecar belongs in that template — a bare Pod created beside the Deployment, or a second Deployment under another name, is invisible to these checks and is thrown away the next time the ReplicaSet replaces a Pod."
  exit 1
}

mains=$(kubectl -n "$ns" get deploy "$dep" \
  -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null)
inits=$(kubectl -n "$ns" get deploy "$dep" \
  -o jsonpath='{.spec.template.spec.initContainers[*].name}' 2>/dev/null)
policy=$(kubectl -n "$ns" get deploy "$dep" \
  -o jsonpath='{.spec.template.spec.initContainers[?(@.name=="shipper")].restartPolicy}' 2>/dev/null)

# The forbidden shape, and a gate rather than a criterion: the question rules
# out the ordinary-container form in as many words, and tailing a log happens to
# work that way, so scoring it would teach that the two are interchangeable.
has_name "$mains" shipper && {
  echo "shipper is an ordinary container under .spec.containers — this question asks for a native sidecar"
  evidence "Under .spec.containers, shipper is just a second application container: it starts in parallel with api rather than before it, it is not guaranteed to outlive it during shutdown, and if it exits the whole Pod's restart policy decides what happens rather than the container's own. tail -F ships lines from either position, which is exactly why the distinction is worth being strict about. Move the entry into .spec.initContainers and give it restartPolicy: Always — that one field is the entire difference between an init container, a sidecar and an ordinary container."
  exit 1
}

crit 1 "shipper is declared under initContainers" \
  "no initContainers entry named 'shipper' (initContainers: $(name_list "$inits"))" \
  "A native sidecar lives in .spec.initContainers, not in .spec.containers. Putting it there is what makes the kubelet start it before the application container and keep it alive alongside it, and it is also what lets it be added to an existing Pod template without disturbing the container already there." \
  -- has_name "$inits" shipper

crit 2 "that entry carries restartPolicy: Always" \
  "the shipper initContainers entry has restartPolicy '${policy:-<none>}', want Always" \
  "restartPolicy: Always on an initContainers entry is the single field that turns an init container into a sidecar. Without it the kubelet treats the entry as an ordinary init container and waits for it to EXIT before starting anything else — and 'tail -F' never exits, so the Pod would sit in Init forever. With it, the container is started first, restarted on its own if it dies, and torn down after the application container so the last lines still get shipped. This is the container's own field, and Always is the only value it accepts — the Pod's separate spec.restartPolicy governs the Pod and has no bearing on it." \
  -- [ "$policy" = "Always" ]

crit_all_passed || evidence "$(crit_why)"
report "native sidecar ok"
