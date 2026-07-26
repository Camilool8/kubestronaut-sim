#!/usr/bin/env bash
set -euo pipefail
echo cache-worker > /opt/course/17/crashing-pod

# The Pod has to have restarted at least once for --previous to exist —
# and for a moment after that it still answers "unable to retrieve
# container logs for containerd://..." on stdout with a zero exit, while
# the old container is being cleaned up. Retry on the *content*, not on
# the exit code, or that message is what gets saved.
for _ in $(seq 1 30); do
  if kubectl -n corvus logs cache-worker --previous > /opt/course/17/crash.log 2>/dev/null \
     && grep -q 'FATAL' /opt/course/17/crash.log; then
    break
  fi
  sleep 3
done
grep -q 'FATAL' /opt/course/17/crash.log

# Record the broken image only while it is still broken: re-running this
# script after a successful run would otherwise capture the *fixed* image
# and quietly invalidate the answer.
current=$(kubectl -n corvus get deploy mailer \
  -o jsonpath='{.spec.template.spec.containers[0].image}')
if [ "$current" != "nginx:1.29-alpine" ]; then
  printf '%s' "$current" > /opt/course/17/bad-image
fi
kubectl -n corvus set image deploy/mailer mailer=nginx:1.29-alpine
kubectl -n corvus rollout status deploy/mailer --timeout=180s
