#!/usr/bin/env bash
set -euo pipefail
kubectl create ns caelum --dry-run=client -o yaml | kubectl apply -f -

# The candidate installs the release themselves, so re-seeding this question
# means going back to an empty Namespace — and the release record has to go with
# the objects, which is why this is not a kubectl delete.
helm -n caelum uninstall object-cache >/dev/null 2>&1 || true
