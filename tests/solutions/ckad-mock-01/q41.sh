#!/usr/bin/env bash
set -euo pipefail

pending=$(kubectl -n columba get pod \
  -o jsonpath='{range .items[?(@.status.phase=="Pending")]}{.metadata.name}{"\n"}{end}' | head -1)
printf '%s\n' "$pending" > /opt/course/41/pod-name

{
  kubectl -n columba get events --field-selector "involvedObject.name=${pending}" \
    -o jsonpath='{range .items[*]}{.reason}{": "}{.message}{"\n"}{end}' 2>/dev/null || true
  kubectl -n columba describe pod "$pending" 2>/dev/null || true
} > /opt/course/41/reason

kubectl -n columba delete pod "$pending" --wait=true --timeout=120s
kubectl -n columba apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: archive-indexer
  namespace: columba
  labels: {app: archive-indexer}
spec:
  containers:
    - name: indexer
      image: busybox:1.37
      command: ["sh", "-c", "sleep 86400"]
      resources:
        requests:
          memory: 64Mi
EOF
kubectl -n columba wait --for=condition=Ready pod/archive-indexer --timeout=120s
