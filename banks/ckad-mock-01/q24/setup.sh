#!/usr/bin/env bash
set -euo pipefail
kubectl create ns auriga --dry-run=client -o yaml | kubectl apply -f -

# A bare Pod, deliberately: no ownerReferences, no ReplicaSet, nothing
# that would put it back. It is also deliberately unhardened, so the
# securityContext is something the candidate adds rather than something
# they copy across.
#
# Re-applied on every reset and bank switch, which is what restores it
# after an attempt in which the candidate did the last step of the
# question and deleted it.
kubectl -n auriga apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: report-runner
  namespace: auriga
  labels:
    app: report-runner
spec:
  containers:
    - name: report
      image: busybox:1.37
      command: ["sh", "-c", "while true; do echo 'report-runner: nothing to do'; sleep 15; done"]
EOF

kubectl -n auriga wait --for=condition=Ready pod/report-runner --timeout=180s
