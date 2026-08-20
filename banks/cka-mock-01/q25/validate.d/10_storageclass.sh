#!/usr/bin/env bash
# points: 2
# desc: StorageClass q25-local-retain provisions through the cluster's local-path provisioner on first consumer, and retains its volumes
set -uo pipefail
. /banks/_lib/checks.sh

SC=q25-local-retain
WANT_PROV=rancher.io/local-path

sc=$(kubectl get storageclass "$SC" -o json 2>/dev/null)

[ -n "$sc" ] || {
  echo "StorageClass $SC not found"
  show_actual text "$(kubectl get storageclass 2>/dev/null)"
  show_why "A StorageClass is cluster-scoped: it has no namespace, so -n crater neither helps nor hurts and the name has to be exactly q25-local-retain. The pane above is every class this cluster has. 'standard' is the one kind installs and it is the default, which is the trap here — a claim that names no class at all is served by it, gets a volume, and goes Bound without any of this question having been done."
  exit 1
}

prov=$(printf '%s' "$sc" | jq -r '.provisioner // "<none>"' 2>/dev/null)
vbm=$(printf '%s' "$sc" | jq -r '.volumeBindingMode // "<none>"' 2>/dev/null)
rec=$(printf '%s' "$sc" | jq -r '.reclaimPolicy // "<none>"' 2>/dev/null)

# A projection rather than the object: a StorageClass carries little else, and
# the four fields below are the whole of what was asked for. isDefault is shown
# because it is the one property of this class that is invisible in the spec —
# it lives in an annotation — and a candidate who copied 'standard' wholesale
# brings it along.
spec=$(printf '%s' "$sc" | jq '{
    provisioner,
    reclaimPolicy,
    volumeBindingMode,
    parameters,
    isDefaultClass: (.metadata.annotations["storageclass.kubernetes.io/is-default-class"] // "false")}' 2>/dev/null)

evidence() {
  show_actual json "${spec:-null}"
  show_why "$1"
}

provisions_on_first_consumer() {
  [ "$prov" = "$WANT_PROV" ] && [ "$vbm" = WaitForFirstConsumer ]
}

# Name only the half that is wrong. "provisioner='rancher.io/local-path', want
# rancher.io/local-path" beside a genuine fault reads as a second fault.
wrong=''
[ "$prov" = "$WANT_PROV" ] || wrong="provisioner='$prov', want $WANT_PROV"
[ "$vbm" = WaitForFirstConsumer ] \
  || wrong="${wrong:+$wrong; }volumeBindingMode='$vbm', want WaitForFirstConsumer"

crit 1 "it provisions through the local-path provisioner, on first consumer" \
  "${wrong:-the class does not provision the way the question asks}" \
  "The provisioner string is what actually wires a class to a controller — the controller watches for claims whose class names IT, and pays no attention to what the class is called. That is why a second class can be served by the same provisioner as 'standard': copy the provisioner, change the policy. Get the string wrong and nothing complains, because a class naming a provisioner nobody runs is a perfectly valid object; its claims simply sit Pending forever. volumeBindingMode decides WHEN the volume is made: WaitForFirstConsumer holds off until a Pod using the claim has been scheduled, so the volume can be placed on the node that Pod landed on. Left out, the field defaults to Immediate, which asks this provisioner to choose a directory on a node before anything has chosen a node — which is why the class kind ships uses WaitForFirstConsumer too." \
  -- provisions_on_first_consumer

crit 1 "volumes on this class are retained, not deleted" \
  "reclaimPolicy='$rec', want Retain" \
  "reclaimPolicy is defaulted to Delete when it is left out, so a class written without the field is the one behaviour this question is trying to avoid. Note where the field is read: it is copied onto each PersistentVolume at the moment that volume is provisioned, and never looked at again. Editing the class afterwards changes nothing that already exists — the volumes carry their own copy, and it is theirs from then on." \
  -- [ "$rec" = Retain ]

crit_all_passed || evidence "$(crit_why)"
report "storage class configured"
