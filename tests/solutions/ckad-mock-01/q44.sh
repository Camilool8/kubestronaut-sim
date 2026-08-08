#!/usr/bin/env bash
set -euo pipefail

# The seeded Job normally reaches its terminal condition inside setup.sh; wait
# again here so the reference run does not race a slow cluster.
for _ in $(seq 1 20); do
  state=$(kubectl -n eridanus get job ledger-reconcile \
    -o jsonpath='{.status.conditions[?(@.type=="Failed")].status}' 2>/dev/null || true)
  if [ "${state:-}" = "True" ]; then break; fi
  sleep 3
done

kubectl -n eridanus get job ledger-reconcile \
  -o jsonpath='{.status.conditions[?(@.type=="Failed")].reason}' > /opt/course/44/reason
echo >> /opt/course/44/reason

{
  kubectl -n eridanus logs -l batch.kubernetes.io/job-name=ledger-reconcile --tail=-1 2>/dev/null || true
  kubectl -n eridanus logs -l job-name=ledger-reconcile --tail=-1 2>/dev/null || true
} > /opt/course/44/failure.log

kubectl -n eridanus delete job ledger-reconcile --wait=true --timeout=120s
kubectl -n eridanus apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: ledger-reconcile
  namespace: eridanus
spec:
  completions: 4
  parallelism: 2
  backoffLimit: 4
  activeDeadlineSeconds: 120
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: reconcile
          image: busybox:1.37
          command: ["sh", "-c", "echo reconciled"]
          resources:
            requests: {memory: 16Mi, cpu: 10m}
EOF
kubectl -n eridanus wait --for=condition=Complete job/ledger-reconcile --timeout=180s
