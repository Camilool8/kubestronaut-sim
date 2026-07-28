#!/usr/bin/env bash
set -euo pipefail
# Idempotent, and deliberately the cheapest possible seed: the point of
# this bank is that a switch to it costs seconds. Removing the namespace
# is what makes a re-seed (reset, or a switch back) genuinely reset the
# question rather than leaving it already solved.
kubectl delete ns smoke --ignore-not-found --wait=false >/dev/null 2>&1 || true
