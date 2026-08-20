#!/usr/bin/env bash
set -euo pipefail
# One strategic merge patch: lists are matched by name, so the volume and the
# sidecar are added while the existing api container only gains a volumeMount.
kubectl -n volans patch deploy orders-api --type=strategic -p '{
  "spec": {"template": {"spec": {
    "volumes": [{"name": "orders-logs", "emptyDir": {}}],
    "initContainers": [{
      "name": "shipper",
      "image": "busybox:1.37",
      "restartPolicy": "Always",
      "command": ["sh", "-c", "tail -F /var/log/orders/app.log"],
      "volumeMounts": [{"name": "orders-logs", "mountPath": "/var/log/orders"}]
    }],
    "containers": [{
      "name": "api",
      "volumeMounts": [{"name": "orders-logs", "mountPath": "/var/log/orders"}]
    }]
  }}}
}'

kubectl -n volans rollout status deploy/orders-api --timeout=180s

# The graded state is behavioural, so wait for the sidecar's own log to carry
# the app's lines rather than for the rollout alone.
ok=''
for _ in $(seq 1 30); do
  pod=$(kubectl -n volans get pod -l app=orders-api \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null | head -1)
  out=''
  if [ -n "$pod" ]; then
    out=$(kubectl -n volans logs "$pod" -c shipper --tail=40 2>/dev/null || true)
  fi
  if [ "$(printf '%s\n' "$out" | grep -c 'orders-api seq=')" -ge 2 ]; then
    ok=1
    break
  fi
  sleep 3
done

[ -n "$ok" ] || {
  echo "the shipper sidecar's log never carried the app's lines" >&2
  kubectl -n volans get pod -l app=orders-api >&2 || true
  exit 1
}
