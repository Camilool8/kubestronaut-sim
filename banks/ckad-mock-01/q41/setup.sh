#!/usr/bin/env bash
set -euo pipefail
kubectl create ns columba --dry-run=client -o yaml | kubectl apply -f -

# A Pod's resources are immutable, so a re-seed cannot apply its way back over a
# repaired archive-indexer — it has to take the object away first. The other two
# Pods are unchanged by the exercise and apply cleanly whether they exist or not.
kubectl -n columba delete pod archive-indexer \
  --ignore-not-found --grace-period=1 --wait=true --timeout=90s

kubectl -n columba apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: price-feed
  namespace: columba
  labels: {app: price-feed}
spec:
  containers:
    - name: feed
      image: busybox:1.37
      command: ["sh", "-c", "sleep 86400"]
      resources:
        requests: {memory: 16Mi, cpu: 10m}
---
apiVersion: v1
kind: Pod
metadata:
  name: report-cache
  namespace: columba
  labels: {app: report-cache}
spec:
  containers:
    - name: cache
      image: nginx:1.29-alpine
      resources:
        requests: {memory: 16Mi, cpu: 10m}
---
# The fault: a request no node can satisfy. The scheduler never places the Pod
# and says so in a FailedScheduling event, which is the whole exercise. 900Gi is
# far beyond any machine this runs on, so the outcome does not depend on the
# host's size the way an absurd CPU request would.
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
        requests: {memory: 900Gi}
EOF

kubectl -n columba wait --for=condition=Ready pod/price-feed pod/report-cache --timeout=120s || true
