#!/usr/bin/env bash
set -euo pipefail
kubectl create ns eridanus --dry-run=client -o yaml | kubectl apply -f -

# The Job can never succeed, and backoffLimit decides how long it keeps trying:
# 2 retries on top of the first attempt is three Pods, each left behind in
# Failed because restartPolicy is Never. It reaches its terminal Failed
# condition in well under a minute and then never changes again, which is what
# makes it safe to grade.
#
# Almost everything in a Job's spec is immutable, so a re-seed cannot apply its
# way back over a rewritten one: the object has to go first.
kubectl -n eridanus delete job ledger-reconcile \
  --ignore-not-found --wait=true --timeout=90s

kubectl -n eridanus apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: ledger-reconcile
  namespace: eridanus
spec:
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: reconcile
          image: busybox:1.37
          command: ["sh", "-c", "echo 'reconcile aborted: ledger checksum mismatch'; exit 1"]
          resources:
            requests: {memory: 16Mi, cpu: 10m}
EOF

# Hand the candidate a Job that has already given up rather than one still
# counting. Bounded at 60s and never fatal: the third Pod normally fails around
# the 35 second mark, and if this cluster is slower the Job reaches the same
# state a few seconds into the attempt instead.
for _ in $(seq 1 20); do
  state=$(kubectl -n eridanus get job ledger-reconcile \
    -o jsonpath='{.status.conditions[?(@.type=="Failed")].status}' 2>/dev/null)
  if [ "${state:-}" = "True" ]; then break; fi
  sleep 3
done
