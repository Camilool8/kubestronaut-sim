#!/usr/bin/env bash
# points: 2
# desc: Pod fast-store runs nginx:1.29-alpine with nodeSelector disk=ssd and is Running
set -uo pipefail
out=$(kubectl -n cka-sched get pod fast-store \
  -o jsonpath='{.spec.containers[0].image} {.spec.nodeSelector.disk} {.status.phase}' 2>/dev/null)
[ "$out" = "nginx:1.29-alpine ssd Running" ] \
  && echo "pod ok" || { echo "pod wrong or not running (got: '$out')"; exit 1; }
