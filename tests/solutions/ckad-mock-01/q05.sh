#!/usr/bin/env bash
set -euo pipefail
kubectl -n lyra apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: feed-writer
  namespace: lyra
spec:
  replicas: 1
  selector:
    matchLabels: {app: feed-writer}
  template:
    metadata:
      labels: {app: feed-writer}
    spec:
      volumes:
        - name: feed-logs
          emptyDir: {}
      initContainers:
        - name: wait-for-source
          image: busybox:1.37
          command: ["sh", "-c", "until wget -q -O /dev/null http://feed-source; do sleep 2; done"]
        - name: shipper
          image: busybox:1.37
          restartPolicy: Always
          command: ["sh", "-c", "tail -F /var/log/feed/app.log"]
          volumeMounts:
            - name: feed-logs
              mountPath: /var/log/feed
      containers:
        - name: writer
          image: busybox:1.37
          command: ["sh", "-c", "while true; do date >> /var/log/feed/app.log; sleep 2; done"]
          volumeMounts:
            - name: feed-logs
              mountPath: /var/log/feed
EOF
kubectl -n lyra rollout status deploy feed-writer --timeout=180s
# Give the writer a couple of ticks so the tail has something to show.
sleep 6
# `logs deploy/...` picks a live Pod from the current ReplicaSet; a
# label selector can still hand back one that is terminating from a
# previous rollout.
kubectl -n lyra logs deploy/feed-writer -c shipper > /opt/course/5/shipper.log
