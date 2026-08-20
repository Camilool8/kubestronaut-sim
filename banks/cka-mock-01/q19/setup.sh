#!/usr/bin/env bash
set -euo pipefail
kubectl create ns volans --dry-run=client -o yaml | kubectl apply -f -

# The seed is a perfectly healthy Deployment with exactly one thing missing: a
# way to read what it writes. The container appends a line a second to a file in
# its OWN filesystem and never touches stdout, so `kubectl logs` is empty while
# the application is working fine — the symptom that makes a log-shipping
# sidecar the answer rather than a nicety.
#
# Nothing here is pre-mounted on purpose. There is no volume, no volumeMount and
# no initContainers entry, so every criterion this question grades is false the
# moment this script finishes: the candidate adds the emptyDir, mounts it on both
# sides, and declares the sidecar.
#
# `sleep 1` rather than a longer nap is deliberate too. The behavioural check
# waits on the sidecar's log carrying app lines, and a line a second means that
# converges within a couple of seconds of the Pod starting — including after a
# `./sim down && up`, which empties the emptyDir and starts the sequence over.
#
# Re-applying is the reset: apply overwrites the whole Pod template, so a warm
# re-run puts the Deployment back to this shape and undoes a candidate's work,
# while a restart leaves it alone.
kubectl -n volans apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
  namespace: volans
spec:
  replicas: 1
  selector:
    matchLabels: {app: orders-api}
  template:
    metadata:
      labels: {app: orders-api}
    spec:
      containers:
        - name: api
          image: busybox:1.37
          command: ["/bin/sh", "-c"]
          args:
            - |
              mkdir -p /var/log/orders
              n=0
              while true; do
                n=$((n + 1))
                echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') orders-api seq=$n order accepted" >> /var/log/orders/app.log
                sleep 1
              done
EOF

kubectl -n volans rollout status deploy/orders-api --timeout=180s
