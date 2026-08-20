#!/usr/bin/env bash
set -euo pipefail
# Everything this question grades is created by the candidate through the
# overlay. All the cluster owes them is the Namespace the overlay pins, which
# `kubectl apply -k` will not create for them.
kubectl create ns scutum --dry-run=client -o yaml | kubectl apply -f -
