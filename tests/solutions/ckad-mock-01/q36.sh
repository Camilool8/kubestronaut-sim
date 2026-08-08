#!/usr/bin/env bash
set -euo pipefail
kubectl -n octans apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: catalog
  namespace: octans
spec:
  type: ExternalName
  externalName: catalog.mensa.svc.cluster.local
EOF

out=""
for _ in $(seq 1 20); do
  out=$(kubectl -n octans exec deploy/shopfront -- \
    curl -s -m 5 http://catalog/ 2>/dev/null) || true
  printf '%s' "$out" | grep -q 'catalog-mensa' && break
  sleep 3
done
printf '%s' "$out" | grep -o 'catalog-mensa' | head -1 > /opt/course/36/catalog-check
