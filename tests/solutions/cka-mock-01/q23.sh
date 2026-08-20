#!/usr/bin/env bash
set -euo pipefail

NS=mensa
SC=q23-local
PV=q23-report-pv
PVC=report-data
POD=report-reader
MOUNT=/data
FILE=report.txt
TOKEN=q23-9f3c1a

kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: $SC
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: $PV
spec:
  capacity:
    storage: 1Gi
  accessModes: [ReadWriteOnce]
  storageClassName: $SC
  local:
    path: /mnt/q23-data
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: In
              values: [sim-worker]
EOF

kubectl -n "$NS" apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: $PVC
  namespace: $NS
spec:
  storageClassName: $SC
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: $POD
  namespace: $NS
spec:
  containers:
    - name: reader
      image: nginx:1.29-alpine
      volumeMounts:
        - name: report
          mountPath: $MOUNT
      resources:
        requests: {cpu: 10m, memory: 16Mi}
  volumes:
    - name: report
      persistentVolumeClaim:
        claimName: $PVC
EOF

# The claim binds only when the Pod is scheduled, so the Pod is what to wait
# for; the binding follows it rather than the other way round.
kubectl -n "$NS" wait --for=condition=Ready "pod/$POD" --timeout=180s

# Graded behaviourally, so wait for the file itself rather than for Ready
# alone: a mount that landed on the wrong directory still reaches Ready.
ok=''
for _ in $(seq 1 20); do
  out=$(kubectl -n "$NS" exec "$POD" -- cat "$MOUNT/$FILE" 2>/dev/null || true)
  case $out in
    *"$TOKEN"*) ok=1; break ;;
  esac
  sleep 3
done

[ -n "$ok" ] || {
  echo "$POD could not read $MOUNT/$FILE" >&2
  kubectl -n "$NS" get pvc,pod -o wide >&2 || true
  kubectl -n "$NS" describe "pod/$POD" >&2 || true
  exit 1
}

bound=$(kubectl -n "$NS" get pvc "$PVC" -o jsonpath='{.status.phase}/{.spec.volumeName}')
[ "$bound" = "Bound/$PV" ] || {
  echo "$PVC is '$bound', want Bound/$PV" >&2
  kubectl get pv >&2 || true
  exit 1
}
