#!/usr/bin/env bash
# points: 3
# desc: PVC archive-pvc requests 1Gi RWO on class manual and is Bound to archive-pv
set -uo pipefail
. /banks/_lib/checks.sh

noise='del(.metadata.finalizers,
           .metadata.annotations."pv.kubernetes.io/bind-completed",
           .metadata.annotations."pv.kubernetes.io/bound-by-controller")'

field() { kubectl -n orion get pvc archive-pvc -o jsonpath="{$1}" 2>/dev/null; }
size=$(field .spec.resources.requests.storage)
modes=$(field '.spec.accessModes[*]')
class=$(field .spec.storageClassName)
phase=$(field .status.phase)
vol=$(field .spec.volumeName)

spec_pane() {
  show_actual yaml "$(kubectl -n orion get pvc archive-pvc -o yaml 2>/dev/null | k8s_clean | yq "$noise")"
  show_why "$1"
}
bind_pane() {
  show_actual text "$(kubectl get pv 2>/dev/null; echo; kubectl -n orion get pvc 2>/dev/null)"
  show_why "$1"
}
pane=''

crit 1 "requests 1Gi" \
  "requested storage is '$size', want 1Gi" \
  "A claim asks for a MINIMUM size. 1Gi binds happily to a 2Gi volume and takes the whole thing — the claim is a request, not a partition." \
  -- [ "$(mib "$size")" = "1024" ] || pane=${pane:-spec_pane}

crit 1 "ReadWriteOnce" \
  "accessModes are '$modes', want ReadWriteOnce" \
  "The access mode is part of what a claim matches on, and it has to be one the volume offers: ReadWriteMany against a ReadWriteOnce volume never binds however small the claim is." \
  -- same_set "$modes" "ReadWriteOnce" || pane=${pane:-spec_pane}

crit 1 "asks for class manual" \
  "storageClassName is '$class', want manual" \
  "Leave storageClassName out and the claim silently gets the cluster's DEFAULT class, which provisions a brand-new volume and leaves archive-pv untouched. Naming a class no provisioner answers for is exactly what forces it to bind to the volume you made instead." \
  -- [ "$class" = "manual" ] || pane=${pane:-spec_pane}

crit 1 "is Bound" \
  "claim is '$phase', not Bound" \
  "A claim stays Pending until some volume satisfies ALL THREE of size, access mode and class. The two tables above are the claim and the volumes it could have matched." \
  -- [ "$phase" = "Bound" ] || pane=${pane:-bind_pane}

crit 1 "bound to archive-pv specifically" \
  "bound to '$vol', want archive-pv" \
  "It bound, but to a volume the cluster's default provisioner created on demand rather than to the one this question asked for. That is what happens when the claim does not pin a class: binding succeeds, everything looks healthy, and the PV you wrote sits Available beside it forever." \
  -- [ "$vol" = "archive-pv" ] || pane=${pane:-bind_pane}

crit_all_passed || "${pane:-spec_pane}" "$(crit_why)"
report "bound to archive-pv"
