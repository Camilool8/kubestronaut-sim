#!/usr/bin/env bash
set -euo pipefail

NS=norma
PV=q24-audit-pv
SC=q24-audit
CLAIM=audit-data
DEP=audit-viewer
MOUNT=/srv/audit
FILE=audit.log
SEAL=q24-8b31fd

# The rescue: clear the reservation the deleted claim left behind. null is how a
# merge patch removes a field, and the volume is never deleted — the uid the
# inventory record holds has to be the one still on the object at the end.
kubectl patch pv "$PV" --type=merge -p '{"spec":{"claimRef": null}}'

for _ in $(seq 1 20); do
  [ "$(kubectl get pv "$PV" -o jsonpath='{.status.phase}')" = Available ] && break
  sleep 2
done

# volumeName as well as the class: on a class with no provisioner the claim
# could only ever be given an existing Available volume, and naming it outright
# leaves no room for it to take anything else.
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: $CLAIM
  namespace: $NS
spec:
  storageClassName: $SC
  volumeName: $PV
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
EOF

for _ in $(seq 1 30); do
  [ "$(kubectl -n "$NS" get pvc "$CLAIM" -o jsonpath='{.status.phase}')" = Bound ] && break
  sleep 2
done

# A merge patch replaces a list outright, which is what is wanted: the emptyDir
# goes and the claim takes its place under the same volume name, so the
# container's volumeMount needs no change at all.
kubectl -n "$NS" patch deploy "$DEP" --type=merge -p '{
  "spec": {"template": {"spec": {
    "volumes": [{"name": "audit",
                 "persistentVolumeClaim": {"claimName": "audit-data"}}]
  }}}
}'

kubectl -n "$NS" rollout status "deploy/$DEP" --timeout=180s

# Graded behaviourally, so wait for the trail itself: a Pod reaches Ready with
# the wrong volume behind the mount just as quickly as with the right one.
ok=''
for _ in $(seq 1 20); do
  pod=$(kubectl -n "$NS" get pod -l app="$DEP" -o json \
    | jq -r '[.items[] | select(.metadata.deletionTimestamp == null and .status.phase == "Running")]
             | sort_by(.metadata.creationTimestamp) | last | .metadata.name // ""')
  if [ -n "$pod" ]; then
    out=$(kubectl -n "$NS" exec "$pod" -- cat "$MOUNT/$FILE" 2>/dev/null || true)
    case $out in
      *"$SEAL"*) ok=1; break ;;
    esac
  fi
  sleep 3
done

[ -n "$ok" ] || {
  echo "$DEP could not read $MOUNT/$FILE" >&2
  kubectl -n "$NS" get pvc,pod -o wide >&2 || true
  kubectl get pv "$PV" >&2 || true
  exit 1
}

state=$(kubectl get pv "$PV" -o jsonpath='{.status.phase}/{.spec.claimRef.namespace}/{.spec.claimRef.name}')
[ "$state" = "Bound/$NS/$CLAIM" ] || {
  echo "$PV is '$state', want Bound/$NS/$CLAIM" >&2
  exit 1
}

# The pairing is by uid, and the check reads it: a volume Bound to a claim of
# the same name but a stale uid is the failure this question is about.
refuid=$(kubectl get pv "$PV" -o jsonpath='{.spec.claimRef.uid}')
claimuid=$(kubectl -n "$NS" get pvc "$CLAIM" -o jsonpath='{.metadata.uid}')
[ "$refuid" = "$claimuid" ] || {
  echo "claimRef on $PV carries uid $refuid, the live claim has $claimuid" >&2
  exit 1
}

# The volume must still be the object the inventory recorded, and still Retain.
recuid=$(kubectl -n "$NS" get cm q24-inventory -o jsonpath='{.data.volumeUid}')
pvuid=$(kubectl get pv "$PV" -o jsonpath='{.metadata.uid}')
policy=$(kubectl get pv "$PV" -o jsonpath='{.spec.persistentVolumeReclaimPolicy}')
[ "$recuid" = "$pvuid" ] && [ "$policy" = Retain ] || {
  echo "$PV uid=$pvuid policy=$policy, record says uid=$recuid policy=Retain" >&2
  exit 1
}
