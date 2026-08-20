#!/usr/bin/env bash
set -euo pipefail

# The Gateway first: the route's parentRefs has to name an object that exists,
# and the controller provisions one nginx deployment per Gateway, which takes a
# few seconds to become Available.
kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: dorado-gateway
  namespace: dorado
spec:
  gatewayClassName: sim
  listeners:
    - name: http
      protocol: HTTP
      port: 80
EOF

kubectl -n dorado wait --for=condition=Programmed gateway/dorado-gateway --timeout=180s

kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: dorado-web-route
  namespace: dorado
spec:
  parentRefs:
    - name: dorado-gateway
  hostnames:
    - web.sim.internal
  rules:
    - backendRefs:
        - name: dorado-web
          port: 80
EOF

# status.parents is written by the controller a moment after the route lands,
# and an empty one is the shape a typo'd parentRefs leaves behind — so poll it
# rather than sleeping a guess, and say which of the two conditions was missing.
attached=''
for _ in $(seq 1 20); do
  if kubectl -n dorado get httproute dorado-web-route -o json | jq -e \
    'any(.status.parents[]?;
         .parentRef.name == "dorado-gateway"
         and any(.conditions[]?; .type == "Accepted"     and .status == "True")
         and any(.conditions[]?; .type == "ResolvedRefs" and .status == "True"))' \
    >/dev/null; then
    attached=1
    break
  fi
  sleep 3
done

[ -n "$attached" ] || {
  echo "the route never reported Accepted+ResolvedRefs on dorado-gateway:" >&2
  kubectl -n dorado get httproute dorado-web-route -o jsonpath='{.status.parents}' >&2 || true
  kubectl -n dorado get gateway,httproute >&2 || true
  exit 1
}

addr=$(kubectl -n dorado get gateway dorado-gateway \
  -o jsonpath='{.status.addresses[*].value}' | awk '{print $1}')
[ -n "$addr" ] || {
  echo "the Gateway published no address" >&2
  kubectl -n dorado get gateway dorado-gateway -o wide >&2 || true
  exit 1
}

# The hostname is a Host header, not a name anything resolves, and the address
# is a ClusterIP — so the request goes from a Pod in the Namespace. Captured
# rather than piped: grep -q leaves a pipeline early, and under pipefail a
# SIGPIPE'd kubectl would fail this script on a working answer.
out=''
ok=''
for _ in $(seq 1 20); do
  out=$(kubectl -n dorado exec deploy/dorado-web -- \
    curl -s -m 5 -H "Host: web.sim.internal" "http://${addr}/" 2>/dev/null) || out=''
  if printf '%s' "$out" | grep -q 'dorado-ok'; then
    ok=1
    break
  fi
  sleep 3
done

[ -n "$ok" ] || {
  echo "nothing answered dorado-ok through the Gateway at ${addr} (got: ${out})" >&2
  kubectl -n dorado get gateway,httproute,svc,deploy >&2 || true
  exit 1
}
