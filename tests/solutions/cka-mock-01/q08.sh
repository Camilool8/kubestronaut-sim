#!/usr/bin/env bash
set -euo pipefail

kubectl -n pavo create serviceaccount ci-bot \
  --dry-run=client -o yaml | kubectl apply -f -

# Three grants differing in group, resource and verb are three rules: the
# generator would hand every verb to every resource in a group.
kubectl apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ci-deployer
  namespace: pavo
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["create"]
  - apiGroups: ["apps"]
    resources: ["deployments/scale"]
    verbs: ["update"]
EOF

kubectl -n pavo create rolebinding ci-bot-deployer \
  --role=ci-deployer --serviceaccount=pavo:ci-bot \
  --dry-run=client -o yaml | kubectl apply -f -
