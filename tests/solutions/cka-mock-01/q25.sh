#!/usr/bin/env bash
set -euo pipefail

NS=crater
SC=q25-local-retain
PVC=archive-data
DEP=archive

# 1. The provisioner is read off the class that already works rather than
# typed, which is also what the question asks the candidate to do. A cluster
# with no default class here would mean the environment changed under the
# question, so say so rather than guessing a string.
prov=$(kubectl get storageclass standard -o jsonpath='{.provisioner}' 2>/dev/null)
[ -n "$prov" ] || {
  echo "q25: no StorageClass 'standard' to read a provisioner from" >&2
  kubectl get storageclass >&2
  exit 1
}

# 2. The class. No is-default-class annotation: standard keeps that job.
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ${SC}
provisioner: ${prov}
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
EOF

# 3. The claim, on that class by name — omitting storageClassName would hand it
# to the default class instead.
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${PVC}
  namespace: ${NS}
spec:
  storageClassName: ${SC}
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
EOF

# 4. The mount. A strategic merge patch rather than a replacement: volumes and
# volumeMounts both merge on `name`, so the container's image and ports survive.
kubectl -n "$NS" patch deploy "$DEP" --type=strategic -p '{
  "spec": {"template": {"spec": {
    "volumes": [{"name": "data", "persistentVolumeClaim": {"claimName": "archive-data"}}],
    "containers": [{"name": "web",
      "volumeMounts": [{"name": "data", "mountPath": "/data"}]}]}}}}'

# The rollout is what schedules a consumer, and scheduling a consumer is what
# makes a WaitForFirstConsumer claim bind. It is not itself graded — the volume
# is pinned to whichever node the Pod landed on, and another question may drain
# or break that node during an attempt — so a slow or stuck rollout is reported
# and the claim's own state is what this script insists on below.
kubectl -n "$NS" rollout status deploy/"$DEP" --timeout=180s \
  || echo "q25: the rollout did not settle; continuing to the claim" >&2

phase=''
for _ in $(seq 1 60); do
  phase=$(kubectl -n "$NS" get pvc "$PVC" -o jsonpath='{.status.phase}' 2>/dev/null || true)
  [ "$phase" = Bound ] && break
  sleep 2
done

[ "$phase" = Bound ] || {
  echo "q25: PersistentVolumeClaim $PVC is '$phase' after 120s, want Bound" >&2
  kubectl -n "$NS" describe pvc "$PVC" >&2
  kubectl -n "$NS" get pods -o wide >&2
  kubectl -n local-path-storage get pods -o wide >&2
  exit 1
}

# ------------------------------------------------------------------ assertions

want() { # label, object json, then jq's own arguments ending in the filter
  local label=$1 json=$2
  shift 2
  printf '%s' "$json" | jq -e "$@" >/dev/null || {
    echo "q25: $label" >&2
    printf '%s' "$json" | jq . >&2
    exit 1
  }
}

sc=$(kubectl get storageclass "$SC" -o json)
want "the class does not provision through ${prov}" "$sc" \
  --arg p "$prov" '.provisioner == $p'
want "the class is not WaitForFirstConsumer" "$sc" \
  '.volumeBindingMode == "WaitForFirstConsumer"'
want "the class does not retain" "$sc" '.reclaimPolicy == "Retain"'
want "the class was marked as the cluster default" "$sc" \
  '(.metadata.annotations["storageclass.kubernetes.io/is-default-class"] // "false") != "true"'

pvc=$(kubectl -n "$NS" get pvc "$PVC" -o json)
want "the claim is not on ${SC}" "$pvc" --arg c "$SC" '.spec.storageClassName == $c'
want "the claim names no volume" "$pvc" '(.spec.volumeName // "") != ""'

# Reached through the claim, never by a name anyone could have predicted: the
# provisioner mints it as pvc-<uid>.
vol=$(printf '%s' "$pvc" | jq -r '.spec.volumeName')
pv=$(kubectl get pv "$vol" -o json)
want "the provisioned volume does not retain" "$pv" \
  '.spec.persistentVolumeReclaimPolicy == "Retain"'

dep=$(kubectl -n "$NS" get deploy "$DEP" -o json)
want "the web container does not mount ${PVC} at /data" "$dep" --arg p "$PVC" '
  .spec.template.spec as $pod
  | [ $pod.volumes[]? | select(.persistentVolumeClaim.claimName == $p) | .name ] as $claimed
  | [ $pod.containers[]?
      | select(.name == "web")
      | .volumeMounts[]?
      | select(.mountPath == "/data")
      | .name as $n
      | select($claimed | index($n) != null) ]
  | length > 0'
