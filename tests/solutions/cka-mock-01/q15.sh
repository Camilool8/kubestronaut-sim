#!/usr/bin/env bash
set -euo pipefail

# The Gateway: the half of the Ingress that owns the port, the host name and
# the certificate. certificateRefs replaces spec.tls[].secretName and lives on
# the listener; the Secret is the seeded one and is not recreated.
kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: lacerta-gateway
  namespace: lacerta
spec:
  gatewayClassName: sim
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      hostname: q15-lacerta.sim.local
      tls:
        mode: Terminate
        certificateRefs:
          - kind: Secret
            name: lacerta-tls
EOF

# The HTTPRoute: the other half. parentRefs is the attachment, which the
# Ingress had no equivalent of; the two backends do not share a port.
kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: lacerta-routes
  namespace: lacerta
spec:
  parentRefs:
    - name: lacerta-gateway
  hostnames:
    - q15-lacerta.sim.local
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /store
      backendRefs:
        - name: storefront
          port: 80
    - matches:
        - path:
            type: PathPrefix
            value: /checkout
      backendRefs:
        - name: checkout
          port: 8080
EOF

# The controller provisions a data plane for this Gateway in the Namespace and
# publishes its address on the Gateway itself. Poll for it: the Deployment has
# to be scheduled and become ready before anything answers.
addr=''
for _ in $(seq 1 40); do
  addr=$(kubectl -n lacerta get gateway lacerta-gateway \
    -o jsonpath='{.status.addresses[*].value}' 2>/dev/null | awk '{print $1}')
  [ -n "$addr" ] && break
  sleep 3
done
[ -n "$addr" ] || {
  echo "the Gateway never published an address:" >&2
  kubectl -n lacerta describe gateway lacerta-gateway >&2 || true
  exit 1
}

# The host name resolves nowhere, and over TLS a Host header cannot supply it:
# the name is chosen in the handshake. --resolve gives curl the answer without
# a resolver and leaves the name in the URL, so SNI carries it.
probe() {
  kubectl -n lacerta exec deploy/storefront -- sh -c \
    "printf 'store: '; curl -sSk -m 3 --resolve 'q15-lacerta.sim.local:443:${addr}' 'https://q15-lacerta.sim.local/store' 2>&1 | tr -d '\r\n';
     printf '\ncheckout: '; curl -sSk -m 3 --resolve 'q15-lacerta.sim.local:443:${addr}' 'https://q15-lacerta.sim.local/checkout' 2>&1 | tr -d '\r\n'; echo" \
    2>/dev/null || true
}

out=''
ok=''
for _ in $(seq 1 20); do
  out=$(probe)
  if printf '%s\n' "$out" | grep -q '^store: storefront-ok' \
    && printf '%s\n' "$out" | grep -q '^checkout: checkout-ok'; then
    ok=1
    break
  fi
  sleep 3
done

[ -n "$ok" ] || {
  echo "the Gateway never routed both paths over HTTPS:" >&2
  printf '%s\n' "$out" >&2
  kubectl -n lacerta get gateway,httproute,svc >&2 || true
  exit 1
}

# Last, and only now that the new path answers.
kubectl -n lacerta delete ingress lacerta-legacy --ignore-not-found
