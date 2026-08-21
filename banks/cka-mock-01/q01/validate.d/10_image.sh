#!/usr/bin/env bash
# points: 3
# desc: the api container runs nginx:1.29-alpine and the image really pulls
# expected: image.json json
set -uo pipefail
. /banks/_lib/checks.sh

ns=orion
dep=telemetry-api

containers=$(kubectl -n "$ns" get deploy "$dep" -o json 2>/dev/null \
  | jq '[.spec.template.spec.containers[]? | {name, image}]')
pods=$(kubectl -n "$ns" get pod -l app=telemetry-api -o json 2>/dev/null \
  | jq '[.items[]? | select(.metadata.deletionTimestamp == null)
         | {phase: .status.phase,
            containers: [.status.containerStatuses[]?
                         | {ready, state: (.state | keys), waiting: (.state.waiting.reason // null)}]}]')

# Only the authored half — the image — gets a generated document. Whether a
# Pod's container actually started is a live reading, not a document, and its
# verdict is already carried by that criterion's own message and why text
# below; a second JSON pane here would collide with the image pane in the UI,
# which shows one actual/expected pair per check, not per criterion.
snapshot() {
  printf '%s' "${containers:-null}" \
    | jq -S '(first(.[]? | select(.name=="api")) // {}) | {image: (.image // null)}' 2>/dev/null
}

evidence() {
  show_pair json image.json
  show_why "$1"
}

names=$(kubectl -n "$ns" get deploy "$dep" \
  -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null)
has_name "$names" api || {
  echo "no container named 'api' in deploy/$dep (found: $(name_list "$names"))"
  show_actual text "containers that exist: $(name_list "$names")"
  show_why "This check reads the container the question named, 'api', inside the Pod template of Deployment telemetry-api in Namespace orion. An empty pane means no such Deployment exists — recreating it under another name, or in another Namespace, puts it beyond every check here. A pane listing other names means the container was renamed, which is not something this question asked for."
  exit 1
}

img=$(kubectl -n "$ns" get deploy "$dep" \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}' 2>/dev/null)

# The behavioural half. Counting Pods whose container has actually STARTED is
# what proves the tag resolves, and it deliberately says nothing about
# readiness: fixing only the image leaves a Pod that runs and never reports
# ready, and that candidate has genuinely solved this half of the question.
running=$(printf '%s' "${pods:-[]}" \
  | jq '[.[] | .containers[] | select(.state | index("running"))] | length' 2>/dev/null)
case ${running:-} in
  ''|*[!0-9]*) running=0 ;;
esac
image_started() { [ "$running" -ge 1 ]; }

crit 2 "the Pod template runs nginx:1.29-alpine" \
  "image is '$img', want nginx:1.29-alpine" \
  "The image lives on the container inside the Deployment's Pod template, and editing it there is what makes a new ReplicaSet roll out. An image changed on a running Pod instead is thrown away the moment that Pod is replaced. The tag this Deployment was seeded with exists in no registry, which is why the kubelet never got as far as starting anything." \
  -- [ "$img" = "nginx:1.29-alpine" ]

crit 1 "the image really pulls — a Pod has a started container" \
  "no Pod is running a container (Pods with a started container: $running)" \
  "ImagePullBackOff means the kubelet asked a registry for that tag and was refused, so the container never started and no probe has ever run against it. This criterion is about that and nothing else: a Pod that starts and then never reports itself ready still earns it, because the image is no longer the thing standing in the way." \
  -- image_started

crit_all_passed || evidence "$(crit_why)"
report "image ok"
