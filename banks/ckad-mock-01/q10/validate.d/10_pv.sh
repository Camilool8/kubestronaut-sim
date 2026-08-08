#!/usr/bin/env bash
# points: 3
# desc: PV archive-pv: 2Gi, RWO, hostPath /mnt/archive, class manual, Retain
set -uo pipefail
. /banks/_lib/checks.sh

noise='del(.spec.claimRef, .metadata.finalizers,
           .metadata.annotations."pv.kubernetes.io/bound-by-controller")'

evidence() {
  show_actual yaml "$(kubectl get pv archive-pv -o yaml 2>/dev/null | k8s_clean | yq "$noise")"
  show_why "$1"
}

field() { kubectl get pv archive-pv -o jsonpath="{$1}" 2>/dev/null; }
size=$(field .spec.capacity.storage)
modes=$(field '.spec.accessModes[*]')
path=$(field .spec.hostPath.path)
class=$(field .spec.storageClassName)
reclaim=$(field .spec.persistentVolumeReclaimPolicy)

# Five fields, each doing something different, so each is scored on its own. An
# empty pane means no PV of this name exists at all; a PV is cluster-scoped, so
# it is not created into a Namespace.
crit 1 "offers 2Gi" \
  "capacity is '$size', want 2Gi" \
  "capacity.storage is what the volume offers, and a claim binds to it only if the volume is at least as big as the claim asks for." \
  -- [ "$(mib "$size")" = "2048" ]

crit 1 "ReadWriteOnce" \
  "accessModes are '$modes', want ReadWriteOnce" \
  "accessModes is how the volume may be mounted and by how many nodes at once. It is part of what a claim matches on, so a volume offering only ReadWriteMany never binds a ReadWriteOnce claim however big it is." \
  -- same_set "$modes" "ReadWriteOnce"

crit 1 "hostPath /mnt/archive" \
  "hostPath is '$path', want /mnt/archive" \
  "hostPath is where the bytes actually live on the node. It is the crudest possible backing store and exactly why it is useful for learning this: nothing is provisioned, the directory simply is the volume." \
  -- [ "$path" = "/mnt/archive" ]

crit 1 "storage class manual" \
  "storageClassName is '$class', want manual" \
  "storageClassName is the name a claim has to ask for to reach THIS volume rather than a provisioner's. Naming a class no provisioner answers for is what forces a claim to bind to a volume you made by hand." \
  -- [ "$class" = "manual" ]

crit 1 "reclaim policy Retain" \
  "persistentVolumeReclaimPolicy is '$reclaim', want Retain" \
  "persistentVolumeReclaimPolicy decides what happens when the claim is deleted: Retain keeps the data in a Released volume for an admin to deal with, Delete removes the underlying storage along with it." \
  -- [ "$reclaim" = "Retain" ]

crit_all_passed || evidence "$(crit_why)"
report "persistent volume ok"
