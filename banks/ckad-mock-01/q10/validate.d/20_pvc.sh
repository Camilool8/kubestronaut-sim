#!/usr/bin/env bash
# points: 2
# desc: PVC archive-pvc requests 1Gi RWO on class manual and is Bound to archive-pv
set -uo pipefail
. /banks/_lib/checks.sh

noise='del(.metadata.finalizers,
           .metadata.annotations."pv.kubernetes.io/bind-completed",
           .metadata.annotations."pv.kubernetes.io/bound-by-controller")'

out=$(kubectl -n orion get pvc archive-pvc \
  -o jsonpath='{.spec.resources.requests.storage}|{.spec.accessModes[*]}|{.spec.storageClassName}' 2>/dev/null)
want='1Gi|ReadWriteOnce|manual'
[ "$out" = "$want" ] || {
  echo "spec is '$out', want '$want'"
  show_actual yaml "$(kubectl -n orion get pvc archive-pvc -o yaml 2>/dev/null | k8s_clean | yq "$noise")"
  show_why "A claim asks for three things: a minimum size, an access mode, and a storage class BY NAME. Leave storageClassName out and the claim silently gets the cluster's default class, which provisions a brand-new volume and leaves archive-pv untouched — naming a class no provisioner answers for is exactly what forces it to bind to the volume you made instead."
  exit 1
}

phase=$(kubectl -n orion get pvc archive-pvc -o jsonpath='{.status.phase}' 2>/dev/null)
vol=$(kubectl -n orion get pvc archive-pvc -o jsonpath='{.spec.volumeName}' 2>/dev/null)
[ "$phase" = "Bound" ] || {
  echo "claim is '$phase', not Bound"
  show_actual text "$(kubectl get pv 2>/dev/null; echo; kubectl -n orion get pvc 2>/dev/null)"
  show_why "A claim stays Pending until some volume satisfies ALL THREE of size, access mode and class — a 1Gi claim binds happily to a 2Gi volume and takes the whole thing, but ReadWriteMany against a ReadWriteOnce volume never binds however small it is. The two tables above are the claim and the volumes it could have matched."
  exit 1
}
[ "$vol" = "archive-pv" ] && echo "bound to archive-pv" || {
  echo "bound to '$vol', want archive-pv"
  show_actual text "$(kubectl get pv 2>/dev/null; echo; kubectl -n orion get pvc 2>/dev/null)"
  show_why "It bound, but to a volume the cluster's default provisioner created on demand rather than to the one this question asked for. That is what happens when the claim does not pin a class: binding succeeds, everything looks healthy, and the PV you wrote sits Available beside it forever."
  exit 1
}
