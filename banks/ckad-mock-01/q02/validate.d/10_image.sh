#!/usr/bin/env bash
# points: 1
# desc: image is nginx:1.29-alpine
set -uo pipefail
. /banks/_lib/checks.sh
img=$(kubectl -n nova get deploy nova-api -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}' 2>/dev/null)
[ "$img" = "nginx:1.29-alpine" ] && echo "image ok" || {
  echo "image is '$img'"
  show_actual json "$(kubectl -n nova get deploy nova-api -o json 2>/dev/null | jq '[.spec.template.spec.containers[] | {name, image}]')"
  show_why "The image belongs to the container inside the Deployment's Pod template, and changing it there is what makes the Deployment roll out a new ReplicaSet. An image edited on a running Pod instead is discarded the moment that ReplicaSet replaces the Pod. The tag this Deployment was seeded with does not exist in any registry, which is why it was never able to start."
  exit 1
}
