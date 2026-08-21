#!/usr/bin/env bash
# points: 3
# desc: PersistentVolume q23-report-pv publishes /mnt/q23-data on sim-worker and claim report-data is bound to it
# expected: volume.json json
set -uo pipefail
. /banks/_lib/checks.sh

NS=mensa
PV=q23-report-pv
PVC=report-data
SC=q23-local
HOSTDIR=/mnt/q23-data
NODE=sim-worker

pv=$(kubectl get pv "$PV" -o json 2>/dev/null | jq '{
  name: (.metadata.name // null),
  storageClassName: (.spec.storageClassName // null),
  local: (.spec.local // null),
  hostPath: (.spec.hostPath // null),
  capacity: (.spec.capacity.storage // null),
  accessModes: (.spec.accessModes // []),
  nodeAffinity: (.spec.nodeAffinity // null),
  phase: (.status.phase // null),
  boundTo: (if (.spec.claimRef | type) == "object"
            then "\(.spec.claimRef.namespace // "?")/\(.spec.claimRef.name // "?")"
            else null end)}' 2>/dev/null)

claim=$(kubectl -n "$NS" get pvc "$PVC" -o json 2>/dev/null | jq '{
  name: (.metadata.name // null),
  phase: (.status.phase // null),
  storageClassName: (.spec.storageClassName // null),
  volumeName: (.spec.volumeName // null),
  request: (.spec.resources.requests.storage // null),
  accessModes: (.spec.accessModes // [])}' 2>/dev/null)

name=$(printf '%s' "${pv:-null}" | jq -r '.name // ""' 2>/dev/null)

# Only the PersistentVolume's own authored fields get a generated document —
# the path, the class and the node affinity are all things this task's
# manifest has to spell out. Whether the claim actually reached this volume is
# a live binding outcome rather than a document, and its verdict is already
# carried by that criterion's own message below; a second pane here would
# collide with this one in the UI, which shows one actual/expected pair per
# check, not per criterion.
snapshot() {
  printf '%s' "${pv:-null}" | jq -S '{
    local: (.local // null),
    storageClassName: (.storageClassName // null),
    nodeAffinity: (.nodeAffinity // null)
  }' 2>/dev/null
}

evidence() {
  show_pair json volume.json
  show_why "$1"
}

[ -n "$name" ] || {
  echo "no PersistentVolume named $PV"
  show_actual text "$(kubectl get pv 2>/dev/null)"
  show_why "This check reads the PersistentVolume called $PV, and the pane above lists the volumes this cluster has. A PersistentVolume is cluster-scoped, so it is created without a namespace. Nothing will provision this one — $SC is the class that says no controller serves it — so no claim on that class is ever satisfied until this object is created by hand: the report sits in $HOSTDIR on $NODE and a PersistentVolume is what publishes a directory on a node to the cluster."
  exit 1
}

path=$(printf '%s' "${pv:-null}" | jq -r '.local.path // ""' 2>/dev/null)
class=$(printf '%s' "${pv:-null}" | jq -r '.storageClassName // ""' 2>/dev/null)

publishes() { [ "$path" = "$HOSTDIR" ] && [ "$class" = "$SC" ]; }

crit 1 "a local volume at $HOSTDIR on class $SC" \
  "spec.local.path='${path:-<none>}' (want $HOSTDIR), storageClassName='${class:-<none>}' (want $SC)" \
  "Two fields, and each one has a claim to satisfy. spec.local.path is the directory ON THE NODE that this volume publishes; $HOSTDIR is where the report was staged, and a volume pointing anywhere else mounts an empty directory at best. spec.storageClassName is what makes the claim reach THIS volume rather than the default class provisioning a fresh empty one: a PersistentVolume and a PersistentVolumeClaim are matched on class first, then on capacity and access modes. Note that spec.hostPath is a different field with a different meaning — it has no node affinity and no scheduler involvement, so it would mount whatever happens to be at that path on whichever node the Pod landed on." \
  -- publishes

affine=$(printf '%s' "${pv:-null}" | jq -r --arg n "$NODE" '
  if any(.nodeAffinity.required.nodeSelectorTerms[]?.matchExpressions[]?;
         .key == "kubernetes.io/hostname" and .operator == "In"
         and any(.values[]?; . == $n))
  then "yes" else "no" end' 2>/dev/null)

crit 1 "node affinity pins it to $NODE" \
  "no required nodeAffinity matching kubernetes.io/hostname In [$NODE]" \
  "A local volume is a directory on one machine, and nothing else in the object says which machine. spec.nodeAffinity.required is what tells the scheduler, so that a Pod using this volume is only ever placed on $NODE — the node where $HOSTDIR and the report actually are. The API server rejects a local PersistentVolume without it, so an object that exists at all has something here; the usual mistakes are the wrong node name (the API knows $NODE; cka-worker1 is a login alias in a client config file and the API server has never heard of it) and preferredDuringScheduling, which the scheduler is free to ignore and which would let the Pod start on a node where the path does not exist. This field is also immutable — a volume pinned to the wrong node has to be deleted and recreated." \
  -- [ "$affine" = yes ]

cphase=$(printf '%s' "${claim:-null}" | jq -r '.phase // ""' 2>/dev/null)
cvol=$(printf '%s' "${claim:-null}" | jq -r '.volumeName // ""' 2>/dev/null)

bound() { [ "$cphase" = Bound ] && [ "$cvol" = "$PV" ]; }

crit 1 "claim $PVC is bound to $PV" \
  "$NS/$PVC is '${cphase:-<no such claim>}' on volume '${cvol:-<none>}', want Bound on $PV" \
  "The claim is the candidate-facing half of the pair, and it is graded on the volume it actually reached rather than on the word Bound alone: this cluster ships a default StorageClass, so a claim that names no class at all is dynamically provisioned an empty directory somewhere and reports Bound while never touching $PV. Bound to the wrong volume, or to none, therefore reads the same way here. If the claim is Pending with no volume, check the two ends against each other — a claim asking for more storage than the volume offers, or for an access mode the volume does not list, never matches — and remember that on a $SC class nothing binds at all until a Pod that uses the claim is scheduled. That last case is not a fault: create the consumer and the binding follows." \
  -- bound

crit_all_passed || evidence "$(crit_why)"
report "$PV publishes $HOSTDIR and $PVC is bound to it"
