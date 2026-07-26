#!/usr/bin/env bash
set -euo pipefail
kubectl create ns carina --dry-run=client -o yaml | kubectl apply -f -

# start.sh added and refreshed the `sim` repo before seeding began.
helm repo update >/dev/null 2>&1 || true

# Idempotent: setup.sh may re-run against a cluster that already has
# these. `helm upgrade --install` is the "make it so" form.
helm -n carina upgrade --install report-api-v1 sim/sim-web --version 1.0.0 --wait --timeout 3m >/dev/null
helm -n carina upgrade --install report-api-v2 sim/sim-web --version 1.0.0 --wait --timeout 3m >/dev/null
helm -n carina upgrade --install report-web    sim/sim-web --version 1.1.0 --wait --timeout 3m >/dev/null

# The broken release the candidate has to find. A tag that cannot be
# pulled means --wait never sees the Deployment become available, so helm
# gives up and records the release as `failed` — deterministically, with
# no need to forge release metadata. `|| true` because that failure is
# the point and must not abort seeding.
if ! helm -n carina status report-legacy >/dev/null 2>&1; then
  helm -n carina install report-legacy sim/sim-web --version 1.0.0 \
    --set image.tag=this-tag-does-not-exist --wait --timeout 45s >/dev/null 2>&1 || true
fi
