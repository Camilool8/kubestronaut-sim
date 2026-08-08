#!/usr/bin/env bash
set -euo pipefail
kubectl -n antlia get deploy \
  --sort-by=.spec.replicas \
  -o custom-columns='NAME:.metadata.name,REPLICAS:.spec.replicas,IMAGE:.spec.template.spec.containers[0].image' \
  > /opt/course/42/report
cat /opt/course/42/report
