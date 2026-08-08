#!/usr/bin/env bash
set -euo pipefail
kubectl -n reticulum apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: reticulum
spec:
  podSelector: {}
  policyTypes: [Ingress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-teller
  namespace: reticulum
spec:
  podSelector:
    matchLabels: {role: ledger}
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: {role: teller}
      ports:
        - {protocol: TCP, port: 80}
EOF

ip=$(kubectl -n reticulum get pod -l role=ledger \
  -o jsonpath='{.items[?(@.status.phase=="Running")].status.podIP}' | awk '{print $1}')

# Calico needs a moment to program the deny; wait for it rather than racing it.
for _ in $(seq 1 15); do
  if kubectl -n reticulum exec deploy/auditor -- curl -s -m 3 -o /dev/null "http://${ip}:80" 2>/dev/null; then
    sleep 2
  else
    break
  fi
done

kubectl -n reticulum exec deploy/teller -- curl -s -m 5 -o /dev/null "http://${ip}:80"
