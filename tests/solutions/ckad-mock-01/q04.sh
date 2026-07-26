#!/usr/bin/env bash
set -euo pipefail
kubectl -n vega apply -f - <<'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: log-rotate
  namespace: vega
spec:
  schedule: "*/5 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 2
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: rotate
              image: busybox:1.37
              command: ["sh", "-c", "date; echo rotated"]
---
apiVersion: batch/v1
kind: Job
metadata:
  name: backfill
  namespace: vega
spec:
  completions: 3
  parallelism: 2
  backoffLimit: 2
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: worker
          image: busybox:1.37
          command: ["sh", "-c", "sleep 2; echo backfilled"]
EOF
kubectl -n vega wait --for=condition=Complete job/backfill --timeout=180s
kubectl -n vega get job backfill -o jsonpath='{.status.succeeded}' > /opt/course/4/backfill-succeeded
