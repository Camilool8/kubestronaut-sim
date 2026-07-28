#!/usr/bin/env bash
# points: 2
# desc: PV archive-pv: 2Gi, RWO, hostPath /mnt/archive, class manual, Retain
set -uo pipefail
# accessModes[*] rather than [0]: the question asks for one access mode,
# so the whole list is the answer. Reading the first element passed a
# volume that also offered ReadWriteMany as long as RWO happened to be
# written first — a laxer check than the question.
out=$(kubectl get pv archive-pv \
  -o jsonpath='{.spec.capacity.storage}|{.spec.accessModes[*]}|{.spec.hostPath.path}|{.spec.storageClassName}|{.spec.persistentVolumeReclaimPolicy}' 2>/dev/null)
want='2Gi|ReadWriteOnce|/mnt/archive|manual|Retain'
[ "$out" = "$want" ] \
  && echo "persistent volume ok" \
  || { echo "got '$out', want '$want'"; exit 1; }
