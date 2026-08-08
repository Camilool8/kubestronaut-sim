#!/usr/bin/env bash
# points: 3
# desc: volumeClaimTemplates entry data asks for 128Mi RWO and is mounted at /data
set -uo pipefail
. /banks/_lib/checks.sh

sts=$(kubectl -n cepheus get statefulset ledger -o json 2>/dev/null)

evidence() {
  show_actual json "$(printf '%s' "$sts" | jq '{
    volumeClaimTemplates: [.spec.volumeClaimTemplates[]? | {
      name: .metadata.name,
      accessModes: .spec.accessModes,
      storage: .spec.resources.requests.storage,
      storageClassName: .spec.storageClassName}],
    containers: [.spec.template.spec.containers[]? | {name, volumeMounts}]}' 2>/dev/null)"
  show_why "$1"
}

tpl=$(printf '%s' "$sts" \
  | jq -r '[.spec.volumeClaimTemplates[]? | select(.metadata.name == "data")] | first // {}' 2>/dev/null)
name=$(printf '%s' "$tpl" | jq -r '.metadata.name // ""' 2>/dev/null)
size=$(printf '%s' "$tpl" | jq -r '.spec.resources.requests.storage // ""' 2>/dev/null)
modes=$(printf '%s' "$tpl" | jq -r '(.spec.accessModes // []) | join(" ")' 2>/dev/null)
cnames=$(printf '%s' "$sts" | jq -r '[.spec.template.spec.containers[]?.name] | join(" ")' 2>/dev/null)
mpath=$(printf '%s' "$sts" | jq -r '[.spec.template.spec.containers[]?
  | select(.name == "ledger") | .volumeMounts[]?
  | select(.name == "data") | .mountPath] | first // ""' 2>/dev/null)

crit 1 "a volumeClaimTemplate named data" \
  "no volumeClaimTemplates entry named 'data'" \
  "volumeClaimTemplates is a sibling of spec.template, not a field inside the Pod spec, and each entry is shaped like a PersistentVolumeClaim. The controller stamps one real claim per replica out of it, which is the whole reason a StatefulSet is the right resource here." \
  -- [ "$name" = "data" ]

crit 1 "asking for 128Mi" \
  "the template requests '$size', want 128Mi" \
  "resources.requests.storage is the size each generated claim asks for. It is a minimum rather than a cap: the provisioner is free to hand back a larger volume, and the claim takes all of it." \
  -- [ "$(mib "$size")" = "128" ]

crit 1 "with access mode ReadWriteOnce" \
  "the template's accessModes are '$modes', want ReadWriteOnce" \
  "ReadWriteOnce means one node may mount the volume read-write at a time, which is exactly right when no two replicas share storage. It is also part of what a claim is matched on, so a mode the backing storage cannot offer leaves the claim Pending forever." \
  -- same_set "$modes" "ReadWriteOnce"

crit 2 "mounted at /data in container ledger" \
  "container 'ledger' mounts 'data' at '$mpath', want /data (containers present: $(name_list "$cnames"))" \
  "Declaring the template and mounting it are two separate steps. A template nobody mounts still creates claims and still binds volumes, and the container sees none of it — the mount is what puts the volume inside the process's filesystem, and it refers to the template by its metadata.name." \
  -- [ "$mpath" = "/data" ]

crit_all_passed || evidence "$(crit_why)"
report "claim template and mount ok"
