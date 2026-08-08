#!/usr/bin/env bash
set -euo pipefail
kubectl create ns norma --dry-run=client -o yaml | kubectl apply -f -

# Applying the overlay is the candidate's step, so re-seeding undoes it. The
# overlay itself lives on the instance, out of this script's reach.
kubectl -n norma delete deploy ledger-api --ignore-not-found >/dev/null
