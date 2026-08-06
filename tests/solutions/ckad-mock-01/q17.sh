#!/usr/bin/env bash
set -euo pipefail
echo cache-worker > /opt/course/17/crashing-pod

current=$(kubectl -n corvus get deploy mailer \
  -o jsonpath='{.spec.template.spec.containers[0].image}')
if [ "$current" != "nginx:1.29-alpine" ]; then
  printf '%s' "$current" > /opt/course/17/bad-image
fi
kubectl -n corvus set image deploy/mailer mailer=nginx:1.29-alpine
kubectl -n corvus rollout status deploy/mailer --timeout=180s

captured=0
for _ in $(seq 1 40); do
  for src in --previous ""; do
    # shellcheck disable=SC2086
    kubectl -n corvus logs cache-worker $src > /opt/course/17/crash.log 2>/dev/null || true
    if grep -q 'FATAL' /opt/course/17/crash.log; then captured=1; break 2; fi
  done
  sleep 3
done
[ "$captured" = "1" ] || { echo "could not capture the crash log" >&2; exit 1; }
