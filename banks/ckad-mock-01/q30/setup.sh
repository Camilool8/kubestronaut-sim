#!/usr/bin/env bash
set -euo pipefail
for ns in crater crater-archive; do
  kubectl create ns "$ns" --dry-run=client -o yaml | kubectl apply -f -
done

kubectl -n crater create configmap report-settings \
  --from-literal=format=csv --from-literal=schedule=nightly \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n crater-archive create configmap retention \
  --from-literal=days=365 \
  --dry-run=client -o yaml | kubectl apply -f -

# The over-broad grant task 4 is about. It names a ServiceAccount that does not
# exist yet, which is legal and is the point: RBAC binds a name, not an object.
kubectl apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: report-reader-legacy
subjects:
  - kind: ServiceAccount
    name: report-reader
    namespace: crater
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: edit
EOF
