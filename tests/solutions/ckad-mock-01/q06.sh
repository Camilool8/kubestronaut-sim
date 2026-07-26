#!/usr/bin/env bash
set -euo pipefail
kubectl -n atlas create configmap app-tuning \
  --from-literal=LOG_LEVEL=debug --from-literal=MAX_WORKERS=8 \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n atlas create configmap app-limits \
  --from-file=/opt/course/6/limits.conf \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n atlas apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: tuned
  namespace: atlas
spec:
  volumes:
    - name: limits
      configMap:
        name: app-limits
  containers:
    - name: web
      image: nginx:1.29-alpine
      envFrom:
        - configMapRef:
            name: app-tuning
      volumeMounts:
        - name: limits
          mountPath: /etc/app
          readOnly: true
EOF
kubectl -n atlas wait --for=condition=Ready pod/tuned --timeout=180s
kubectl -n atlas exec tuned -c web -- printenv MAX_WORKERS > /opt/course/6/max-workers
