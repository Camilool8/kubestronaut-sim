#!/usr/bin/env bash
set -euo pipefail
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolume
metadata:
  name: archive-pv
spec:
  capacity:
    storage: 2Gi
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
  hostPath:
    path: /mnt/archive
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: archive-pvc
  namespace: orion
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: manual
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: archiver
  namespace: orion
spec:
  volumes:
    - name: archive
      persistentVolumeClaim:
        claimName: archive-pvc
    - name: scratch
      emptyDir: {}
  containers:
    - name: web
      image: nginx:1.29-alpine
      volumeMounts:
        - name: archive
          mountPath: /var/archive
        - name: scratch
          mountPath: /var/scratch
EOF
kubectl -n orion wait --for=condition=Ready pod/archiver --timeout=180s
