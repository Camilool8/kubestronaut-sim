#!/usr/bin/env bash
# points: 2
# desc: PV archive-pv: 2Gi, RWO, hostPath /mnt/archive, class manual, Retain
set -uo pipefail
. /banks/_lib/checks.sh

# spec.claimRef is written by the binding controller and carries the
# claim's uid and resourceVersion; the pv-protection finalizer and the
# bound-by-controller annotation are the controller's bookkeeping too.
# None of it is anybody's answer, and all of it differs per cluster —
# the same reasoning k8s_clean applies to clusterIP, one level down.
# Candidates for promotion into k8s_clean if another question captures a
# bound volume.
noise='del(.spec.claimRef, .metadata.finalizers,
           .metadata.annotations."pv.kubernetes.io/bound-by-controller")'

# accessModes[*] rather than [0]: the question asks for one access mode,
# so the whole list is the answer. Reading the first element passed a
# volume that also offered ReadWriteMany as long as RWO happened to be
# written first — a laxer check than the question.
out=$(kubectl get pv archive-pv \
  -o jsonpath='{.spec.capacity.storage}|{.spec.accessModes[*]}|{.spec.hostPath.path}|{.spec.storageClassName}|{.spec.persistentVolumeReclaimPolicy}' 2>/dev/null)
want='2Gi|ReadWriteOnce|/mnt/archive|manual|Retain'
[ "$out" = "$want" ] && echo "persistent volume ok" || {
  echo "got '$out', want '$want'"
  show_actual yaml "$(kubectl get pv archive-pv -o yaml 2>/dev/null | k8s_clean | yq "$noise")"
  show_why "Five fields, each doing something different. capacity is what the volume offers, accessModes is how it may be mounted and by how many nodes at once, storageClassName is the name a claim has to ask for to reach this volume rather than a provisioner's, hostPath is where the bytes actually live on the node, and persistentVolumeReclaimPolicy decides what happens when the claim is deleted — Retain keeps the data in a Released volume for an admin, Delete removes the underlying storage with it. An empty pane means no PV of this name exists; a PV is cluster-scoped, so it is not created into a Namespace."
  exit 1
}
