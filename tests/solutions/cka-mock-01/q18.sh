#!/usr/bin/env bash
set -euo pipefail

# Both paths under one host, in one rule. The ports are not the same: api is
# published on 8080 and web on 80, so the second path is not a copy of the
# first with the path changed.
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: phoenix-routes
  namespace: phoenix
spec:
  ingressClassName: nginx
  rules:
    - host: q18-phoenix.sim.local
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 8080
          - path: /web
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
EOF

ip=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.spec.clusterIP}')
[ -n "$ip" ] || { echo "the ingress controller Service has no ClusterIP" >&2; exit 1; }

# The host resolves nowhere, so the request goes to the controller's address
# with the name in a header. The controller reloads a moment after admitting
# the Ingress, so poll rather than sleeping a guessed interval.
probe() {
  kubectl -n phoenix exec deploy/api -- sh -c \
    "printf 'api-path: '; curl -s -m 3 -H 'Host: q18-phoenix.sim.local' 'http://${ip}/api';
     printf '\nweb-path: '; curl -s -m 3 -H 'Host: q18-phoenix.sim.local' 'http://${ip}/web'; echo" \
    2>/dev/null || true
}

out=''
ok=''
for _ in $(seq 1 20); do
  out=$(probe)
  if printf '%s\n' "$out" | grep -q '^api-path: api-ok' \
    && printf '%s\n' "$out" | grep -q '^web-path: web-ok'; then
    ok=1
    break
  fi
  sleep 3
done

[ -n "$ok" ] || {
  echo "the controller never routed both paths through phoenix-routes:" >&2
  printf '%s\n' "$out" >&2
  kubectl -n phoenix get ingress,svc,endpointslice >&2 || true
  exit 1
}
