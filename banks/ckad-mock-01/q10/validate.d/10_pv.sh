#!/usr/bin/env bash
# points: 3
# desc: PV archive-pv: 2Gi, RWO, hostPath /mnt/archive, class manual, Retain
set -uo pipefail
out=$(kubectl get pv archive-pv \
  -o jsonpath='{.spec.capacity.storage}|{.spec.accessModes[0]}|{.spec.hostPath.path}|{.spec.storageClassName}|{.spec.persistentVolumeReclaimPolicy}' 2>/dev/null)
want='2Gi|ReadWriteOnce|/mnt/archive|manual|Retain'
[ "$out" = "$want" ] \
  && echo "persistent volume ok" \
  || { echo "got '$out', want '$want'"; exit 1; }
