#!/usr/bin/env bash
set -euo pipefail
echo cache-worker > /opt/course/17/crashing-pod

# Do the mailer work first. Capturing the crash log is the part that can
# need patience, and it must not hold up — or, on a bad run, abort —
# everything else.
current=$(kubectl -n corvus get deploy mailer \
  -o jsonpath='{.spec.template.spec.containers[0].image}')
if [ "$current" != "nginx:1.29-alpine" ]; then
  printf '%s' "$current" > /opt/course/17/bad-image
fi
kubectl -n corvus set image deploy/mailer mailer=nginx:1.29-alpine
kubectl -n corvus rollout status deploy/mailer --timeout=180s

# `logs --previous` is the right tool, but it answers "unable to retrieve
# container logs for containerd://..." on stdout with a zero exit
# whenever the container it wants has already been collected — which
# happens transiently as CrashLoopBackOff churns. Retry on content, and
# fall back to the current logs, which for a Pod in backoff are the last
# dead container's anyway.
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
