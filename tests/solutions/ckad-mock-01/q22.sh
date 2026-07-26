#!/usr/bin/env bash
set -euo pipefail
kubectl -n dorado apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: checkout
  namespace: dorado
spec:
  volumes:
    - name: conf
      configMap:
        name: ambassador-conf
  containers:
    - name: app
      image: busybox:1.37
      command: ["sh", "-c", "sleep 3600"]
    - name: ambassador
      image: nginx:1.29-alpine
      volumeMounts:
        - name: conf
          mountPath: /etc/nginx/conf.d
EOF
kubectl -n dorado wait --for=condition=Ready pod/checkout --timeout=180s
# nginx needs a moment after Ready before it accepts the first connection.
for _ in $(seq 1 10); do
  kubectl -n dorado exec checkout -c app -- \
    wget -qO- -T 5 http://localhost:8080 2>/dev/null | grep -q backend-ok && break
  sleep 3
done
