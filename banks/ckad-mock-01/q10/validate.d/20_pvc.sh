#!/usr/bin/env bash
# points: 2
# desc: PVC archive-pvc requests 1Gi RWO on class manual and is Bound to archive-pv
set -uo pipefail
. /banks/_lib/checks.sh

# The pvc-protection finalizer and the two pv.kubernetes.io/bind-*
# annotations are written by the binding controller, not by the
# candidate. spec.volumeName STAYS: it is what this check is about.
noise='del(.metadata.finalizers,
           .metadata.annotations."pv.kubernetes.io/bind-completed",
           .metadata.annotations."pv.kubernetes.io/bound-by-controller")'

# accessModes[*], not [0] — see the note in 10_pv.sh. One access mode was
# asked for, so the whole list is the answer.
out=$(kubectl -n orion get pvc archive-pvc \
  -o jsonpath='{.spec.resources.requests.storage}|{.spec.accessModes[*]}|{.spec.storageClassName}' 2>/dev/null)
want='1Gi|ReadWriteOnce|manual'
[ "$out" = "$want" ] || {
  echo "spec is '$out', want '$want'"
  show_actual yaml "$(kubectl -n orion get pvc archive-pvc -o yaml 2>/dev/null | k8s_clean | yq "$noise")"
  show_why "A claim asks for three things: a minimum size, an access mode, and a storage class BY NAME. Leave storageClassName out and the claim silently gets the cluster's default class, which provisions a brand-new volume and leaves archive-pv untouched — naming a class no provisioner answers for is exactly what forces it to bind to the volume you made instead."
  exit 1
}

# Bound is the part that cannot be faked: a mismatched class, size or
# access mode leaves the claim Pending forever, and the default dynamic
# provisioner would otherwise quietly bind it to a volume of its own.
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
