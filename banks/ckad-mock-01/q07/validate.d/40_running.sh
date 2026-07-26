#!/usr/bin/env bash
# points: 1
# desc: the hardened Pod actually runs
set -uo pipefail
# Every setting above can be present in a Pod that never starts —
# readOnlyRootFilesystem in particular breaks images that write at boot.
phase=$(kubectl -n cygnus get pod vault-agent -o jsonpath='{.status.phase}' 2>/dev/null)
[ "$phase" = "Running" ] \
  && echo "running" \
  || { echo "phase is '$phase', want Running"; exit 1; }
