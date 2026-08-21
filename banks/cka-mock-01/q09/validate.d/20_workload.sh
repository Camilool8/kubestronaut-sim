#!/usr/bin/env bash
# points: 3
# desc: the live release runs 3 ready replicas of the 1.1.0 image behind a Service on 8080
# expected: image.json json
set -uo pipefail
. /banks/_lib/checks.sh

img=$(kubectl -n tucana get deploy storefront \
  -o jsonpath='{.spec.template.spec.containers[*].image}' 2>/dev/null)
ready=$(kubectl -n tucana get deploy storefront -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
want=$(kubectl -n tucana get deploy storefront -o jsonpath='{.spec.replicas}' 2>/dev/null)
svc_port=$(kubectl -n tucana get svc storefront -o jsonpath='{.spec.ports[*].port}' 2>/dev/null)

# Only the image is a shape the candidate influenced (indirectly — see below).
# readyReplicas and the Service reachability test are live readings and ride
# on their own crit messages instead of a second pane.
snapshot() {
  jq -nS --arg img "${img:-}" '{image: (if $img == "" then null else $img end)}' 2>/dev/null
}

evidence() {
  show_pair json image.json
  show_why "$1"
}

[ -n "$img" ] || {
  echo "there is no Deployment named storefront in namespace tucana"
  show_actual text "$(kubectl -n tucana get deploy,svc,pod 2>/dev/null)"
  show_why "The chart names every object it renders after the release, so a release called storefront produces a Deployment and a Service of that name. Nothing of the sort is here: either the release was never installed, or it was installed under another name, or it was installed into another Namespace — a Helm release is namespaced and only ever creates its objects where it was told to."
  exit 1
}

# The image tag was never the candidate's to set: 1.0.0 defaults to
# 1.27-alpine and 1.1.0 to 1.29-alpine, so the running tag is the cluster-side
# evidence of which chart version the release was last rendered from.
on_the_new_chart() { [ "$img" = "nginx:1.29-alpine" ]; }

all_ready() { [ "$ready" = "3" ]; }

# Behavioural: this crosses cluster DNS, the Service port, the named targetPort
# the chart wires to the container, and the selector — none of which a field
# read proves together. It runs from a workload the question already runs, so
# no Pod is scheduled inside the check's 30s budget.
service_answers() {
  kubectl -n tucana exec deploy/storefront -- \
    wget -q -T 4 -O /dev/null http://storefront:8080 2>/dev/null
}

crit 1 "the Pods run the 1.1.0 chart's image" \
  "the Deployment runs '$img', want nginx:1.29-alpine" \
  "The chart builds this string from image.repository and image.tag, and neither was yours to override — 1.0.0 defaults to nginx:1.27-alpine and 1.1.0 to nginx:1.29-alpine. So the tag running here is what the release was last rendered from: 1.27 means the upgrade never happened, and anything else means the tag was overridden when the question asked for exactly two overrides. An override that is not asked for is still a deviation from the chart." \
  -- on_the_new_chart

crit 1 "3 replicas are ready" \
  "readyReplicas is '$ready' against a spec of '$want' replicas, want 3 ready" \
  "replicaCount is rendered into the Deployment's spec and the cluster then has to satisfy it. A spec that already says 3 with fewer ready means Pods are still starting or cannot start; a spec that says something else means the override did not reach this revision — helm upgrade drops the previous revision's values unless they are passed again." \
  -- all_ready

crit 1 "the Service answers on port 8080" \
  "a request to http://storefront:8080 from inside the release's own Pod got no response (the Service publishes port(s) '$svc_port')" \
  "This is the port a client uses, which the chart takes from service.port; the container keeps listening on 80 and the Service's targetPort is the chart's named port, so overriding the value moves the front door and nothing else. A failure here is the port still being the chart's default 80, the Service selecting no Pod, or no Pod being ready to answer at all." \
  -- service_answers

crit_all_passed || evidence "$(crit_why)"
report "storefront: ${ready}/3 ready on ${img}, Service on ${svc_port}"
