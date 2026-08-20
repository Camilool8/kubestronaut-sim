#!/usr/bin/env bash
set -euo pipefail

# The default first: it selects every Pod in hydra and names both directions,
# which is what turns "nothing is denied" into "nothing is allowed". The two
# exceptions then reopen exactly one path — the api Pods accept 8080 from the
# frontend Pods, and the frontend Pods may leave for that port and for DNS.
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: hydra
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-ingress
  namespace: hydra
spec:
  podSelector:
    matchLabels: {tier: api}
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: {tier: frontend}
      ports:
        - {protocol: TCP, port: 8080}
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-egress
  namespace: hydra
spec:
  podSelector:
    matchLabels: {tier: frontend}
  policyTypes: [Egress]
  egress:
    - to:
        - podSelector:
            matchLabels: {tier: api}
      ports:
        - {protocol: TCP, port: 8080}
    - to:
        - namespaceSelector:
            matchLabels: {kubernetes.io/metadata.name: kube-system}
          podSelector:
            matchLabels: {k8s-app: kube-dns}
      ports:
        - {protocol: UDP, port: 53}
        - {protocol: TCP, port: 53}
EOF

fe_pod=$(kubectl -n hydra get pod -l tier=frontend \
  -o jsonpath='{.items[0].metadata.name}')
db_pod=$(kubectl -n hydra get pod -l tier=db \
  -o jsonpath='{.items[0].metadata.name}')
api_ip=$(kubectl -n hydra get pod -l tier=api \
  -o jsonpath='{.items[0].status.podIP}')
db_ip=$(kubectl -n hydra get pod -l tier=db \
  -o jsonpath='{.items[0].status.podIP}')
[ -n "$fe_pod" ] && [ -n "$db_pod" ] && [ -n "$api_ip" ] && [ -n "$db_ip" ] || {
  echo "the seeded hydra Pods are not all running" >&2
  kubectl -n hydra get pod -o wide >&2 || true
  exit 1
}

# Every probe is bounded: a denied packet is dropped, so an unbounded client
# waits for a handshake that never comes.
reaches() { # pod address port
  kubectl -n hydra exec "$1" -- \
    wget -q -T 2 -O /dev/null "http://$2:$3/" >/dev/null 2>&1
}
resolves() {
  kubectl -n hydra exec "$fe_pod" -- \
    timeout 3 nslookup api.hydra.svc.cluster.local >/dev/null 2>&1
}

ok=''
for _ in $(seq 1 12); do
  if reaches "$fe_pod" "$api_ip" 8080 \
    && ! reaches "$fe_pod" "$api_ip" 9090 \
    && ! reaches "$fe_pod" "$db_ip" 5432 \
    && ! reaches "$db_pod" "$api_ip" 8080 \
    && resolves; then
    ok=1
    break
  fi
  sleep 2
done

[ -n "$ok" ] || {
  echo "the policies did not converge on one open path" >&2
  kubectl -n hydra get netpol >&2 || true
  kubectl -n hydra get pod --show-labels >&2 || true
  exit 1
}
