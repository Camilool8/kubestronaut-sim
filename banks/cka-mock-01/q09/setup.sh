#!/usr/bin/env bash
set -euo pipefail
kubectl create ns tucana --dry-run=client -o yaml | kubectl apply -f -

# The candidate installs the release themselves, so re-seeding this question
# means handing back an empty Namespace — and the release RECORD has to go with
# the objects, which is why this is helm uninstall rather than kubectl delete.
# A leftover record would let a re-run be graded on the previous attempt's
# revision history.
helm -n tucana uninstall storefront >/dev/null 2>&1 || true
