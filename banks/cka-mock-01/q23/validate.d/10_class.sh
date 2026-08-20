#!/usr/bin/env bash
# points: 3
# desc: StorageClass q23-local provisions nothing and binds on the first consumer
set -uo pipefail
. /banks/_lib/checks.sh

SC=q23-local
PROV=kubernetes.io/no-provisioner
MODE=WaitForFirstConsumer

sc=$(kubectl get storageclass "$SC" -o json 2>/dev/null | jq '{
  name: (.metadata.name // null),
  provisioner: (.provisioner // null),
  volumeBindingMode: (.volumeBindingMode // null),
  reclaimPolicy: (.reclaimPolicy // null)}' 2>/dev/null)

name=$(printf '%s' "${sc:-null}" | jq -r '.name // ""' 2>/dev/null)

evidence() {
  show_actual json "${sc:-null}"
  show_why "$1"
}

[ -n "$name" ] || {
  echo "no StorageClass named $SC"
  show_actual text "$(kubectl get storageclass 2>/dev/null)"
  show_why "Every criterion here reads the StorageClass called $SC, and the pane above lists the classes this cluster has. The class is cluster-scoped, so it is created without a namespace — 'kubectl get sc' with no -n finds it. Note that the cluster already ships a default class named 'standard' that provisions dynamically; this task is the opposite case, a class for volumes an administrator has already placed on a node by hand, and it has to exist under its own name for the PersistentVolume and the claim to meet on it."
  exit 1
}

prov=$(printf '%s' "${sc:-null}" | jq -r '.provisioner // ""' 2>/dev/null)
mode=$(printf '%s' "${sc:-null}" | jq -r '.volumeBindingMode // ""' 2>/dev/null)

crit 1 "provisioner is $PROV" \
  "provisioner is '${prov:-<none>}', want $PROV" \
  "A StorageClass names the thing that creates volumes for it. No controller can hand you a directory that already exists on a node — a provisioner only ever makes something new — so the class has to say that nothing serves it: kubernetes.io/no-provisioner is the reserved value meaning 'the volumes on this class are the ones an administrator pre-created'. Name a real provisioner instead — rancher.io/local-path is installed here and serves the default 'standard' class — and the claim would be satisfied by a freshly provisioned volume somewhere else on the cluster, and the report staged on sim-worker would never be read by anything. The field is immutable, so a class created with the wrong provisioner has to be deleted and recreated." \
  -- [ "$prov" = "$PROV" ]

crit 2 "volumeBindingMode is $MODE" \
  "volumeBindingMode is '${mode:-<none>}', want $MODE" \
  "The binding mode decides WHEN a claim on this class is matched to a volume. The default, Immediate, binds as soon as the claim is created — before anything knows where the consuming Pod will run, which for a volume that exists on exactly one node is a coin toss: bind first and the scheduler is then forced onto whatever node the volume turned out to be on, or the Pod is left unschedulable. $MODE defers binding until a Pod that uses the claim is being scheduled, so the volume's node affinity becomes an input to that decision instead of a constraint discovered afterwards. The visible consequence is the one this task warns about: the claim stays Pending until a consumer appears, and that is the mode working, not a fault. The field is immutable — recreate the class if it was created without it." \
  -- [ "$mode" = "$MODE" ]

crit_all_passed || evidence "$(crit_why)"
report "$SC is a no-provisioner class that waits for its first consumer"
