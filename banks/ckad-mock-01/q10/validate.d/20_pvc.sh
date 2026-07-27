#!/usr/bin/env bash
# points: 2
# desc: PVC archive-pvc requests 1Gi RWO on class manual and is Bound to archive-pv
set -uo pipefail
out=$(kubectl -n orion get pvc archive-pvc \
  -o jsonpath='{.spec.resources.requests.storage}|{.spec.accessModes[0]}|{.spec.storageClassName}' 2>/dev/null)
want='1Gi|ReadWriteOnce|manual'
[ "$out" = "$want" ] || { echo "spec is '$out', want '$want'"; exit 1; }

# Bound is the part that cannot be faked: a mismatched class, size or
# access mode leaves the claim Pending forever, and the default dynamic
# provisioner would otherwise quietly bind it to a volume of its own.
phase=$(kubectl -n orion get pvc archive-pvc -o jsonpath='{.status.phase}' 2>/dev/null)
vol=$(kubectl -n orion get pvc archive-pvc -o jsonpath='{.spec.volumeName}' 2>/dev/null)
[ "$phase" = "Bound" ] || { echo "claim is '$phase', not Bound"; exit 1; }
[ "$vol" = "archive-pv" ] \
  && echo "bound to archive-pv" \
  || { echo "bound to '$vol', want archive-pv"; exit 1; }
