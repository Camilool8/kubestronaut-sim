#!/usr/bin/env bash
set -euo pipefail

# api-resources prints the bare <plural>.<group>, which is what the file wants;
# get crd -o name would need its resource/name prefix stripping off first.
kubectl api-resources --api-group=logistics.sim.dev -o name \
  | sort > /opt/course/11/crds

kubectl explain shipment.spec > /opt/course/11/shipment-spec

kubectl apply -f - <<'EOF'
apiVersion: logistics.sim.dev/v1alpha1
kind: Shipment
metadata:
  name: atlas-7
  namespace: pyxis
spec:
  destination: rotterdam-north
  weightKg: 1200
  priority: express
  carrier:
    name: blue-line
    contract: LOG-2291
EOF

# A structural schema prunes what it does not declare without complaining, so
# the object is read back rather than assumed from apply's exit status.
kubectl -n pyxis get shipment atlas-7 \
  -o jsonpath='{.spec.carrier.contract}' | grep -q LOG-2291
