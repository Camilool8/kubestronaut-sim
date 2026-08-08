#!/usr/bin/env bash
set -euo pipefail
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout /opt/course/37/tls.key \
  -out    /opt/course/37/tls.crt \
  -subj   '/CN=sculptor.sim.local' \
  -addext 'subjectAltName=DNS:sculptor.sim.local' >/dev/null 2>&1

kubectl -n sculptor create secret tls portal-tls \
  --cert=/opt/course/37/tls.crt --key=/opt/course/37/tls.key \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n sculptor apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: portal-https
  namespace: sculptor
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - sculptor.sim.local
      secretName: portal-tls
  rules:
    - host: sculptor.sim.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: portal
                port:
                  number: 80
EOF

ip=$(kubectl -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.spec.clusterIP}')
out=""
for _ in $(seq 1 20); do
  out=$(kubectl -n sculptor exec deploy/portal -- \
    curl -sk -m 5 --resolve "sculptor.sim.local:443:${ip}" \
    https://sculptor.sim.local/ 2>/dev/null) || true
  printf '%s' "$out" | grep -q 'portal-ok' && break
  sleep 3
done
printf '%s' "$out" | grep -q 'portal-ok'
