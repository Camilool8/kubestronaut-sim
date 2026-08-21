#!/usr/bin/env bash
# points: 1
# desc: image is nginx:1.29-alpine
# expected: image.json json
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl -n nova get deploy nova-api -o json 2>/dev/null \
    | jq -S '(first(.spec.template.spec.containers[]? | select(.name=="api")) // {}) | {image: (.image // null)}'
}

evidence() {
  show_pair json image.json
  show_why "$1"
}

names=$(kubectl -n nova get deploy nova-api -o jsonpath='{.spec.template.spec.containers[*].name}' 2>/dev/null)
has_name "$names" api || {
  echo "no container named 'api' in deploy/nova-api (found: $(name_list "$names"))"
  show_actual text "containers that exist: $(name_list "$names")"
  show_why "The image this check grades belongs to the container named api in the Pod template of Deployment nova-api, Namespace nova. An empty pane means no such Deployment exists; any other name means the container was renamed, which this question never asked for."
  exit 1
}

img=$(kubectl -n nova get deploy nova-api -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}' 2>/dev/null)
[ "$img" = "nginx:1.29-alpine" ] && echo "image ok" || {
  echo "image is '$img'"
  evidence "The image belongs to the container inside the Deployment's Pod template, and changing it there is what makes the Deployment roll out a new ReplicaSet. An image edited on a running Pod instead is discarded the moment that ReplicaSet replaces the Pod. The tag this Deployment was seeded with does not exist in any registry, which is why it was never able to start."
  exit 1
}
