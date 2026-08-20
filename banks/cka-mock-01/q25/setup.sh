#!/usr/bin/env bash
set -euo pipefail

NS=crater
SC=q25-local-retain
PVC=archive-data
DEP=archive

kubectl create ns "$NS" --dry-run=client -o yaml | kubectl apply -f -

# Everything this question grades is the candidate's to create: the class, the
# claim and the mount. So the seed's whole job is to leave a Deployment with no
# storage on it and to make sure a previous attempt's answer is not sitting
# there waiting to be scored again.
#
# Order matters on a reseed. A PVC with a Pod still mounting it is held by the
# pvc-protection finalizer and will not delete, so the Deployment goes first;
# and a PV is only free of its claim once the PVC is gone, so the leftover
# volumes go last. Each step is a no-op on a cluster that was just created.
kubectl -n "$NS" delete deploy "$DEP" --ignore-not-found --timeout=90s
# Every Pod, not just the Deployment's: a previous candidate may have mounted
# the claim from a Pod of their own, and one of those still terminating is
# enough to hold the PVC. crater belongs to this question alone, so there is
# nothing else in it to lose, and a Namespace with no Pods is a no-op.
kubectl -n "$NS" delete pod --all --now --timeout=90s
kubectl -n "$NS" delete pvc "$PVC" --ignore-not-found --timeout=90s

# Retain is the point of the question and it is also what makes the reseed
# untidy: a claim deleted off this class leaves its PersistentVolume behind,
# Released, together with a directory on whichever node the Pod ran on. The PV
# objects are cleared here (deleting a Retain PV removes the object, never the
# data) so a second attempt starts on an empty cluster-scoped namespace. The
# directories are left where they are — nothing reads them, and a check that
# went looking for them would be reading a node instead of the API.
#
# Selected by class rather than by name: these names are controller-generated
# (pvc-<uid>) and never predictable.
leftover=$(kubectl get pv -o json 2>/dev/null \
  | jq -r --arg sc "$SC" '[.items[]? | select(.spec.storageClassName == $sc) | .metadata.name] | join(" ")' \
  || true)
for pv in $leftover; do
  kubectl delete pv "$pv" --ignore-not-found --timeout=90s
done

kubectl delete storageclass "$SC" --ignore-not-found

kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${DEP}
  namespace: ${NS}
  labels: {app: archive}
spec:
  replicas: 1
  # Recreate rather than the default rolling update. A dynamically provisioned
  # local volume is pinned to the node its first consumer was scheduled to and
  # is ReadWriteOnce, so a surge replica on a second node would sit Pending
  # behind a volume it cannot reach. One Pod at a time sidesteps that entirely.
  strategy: {type: Recreate}
  selector:
    matchLabels: {app: archive}
  template:
    metadata:
      labels: {app: archive}
    spec:
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports:
            - containerPort: 80
EOF

kubectl -n "$NS" rollout status deploy/"$DEP" --timeout=180s

# The provisioner is cluster infrastructure kind installs, not something this
# question seeds, so this is a precondition report rather than a step: if it is
# not up, every dynamic claim on the cluster stays Pending and the seed log is
# where that should be visible. Non-fatal on purpose — the rest of the seed is
# still correct, and the check's own evidence pane names the provisioner too.
if kubectl -n local-path-storage get deploy local-path-provisioner >/dev/null 2>&1; then
  kubectl -n local-path-storage rollout status deploy/local-path-provisioner --timeout=30s \
    || echo "q25: warning: the local-path provisioner is not Available; dynamic claims will stay Pending"
else
  echo "q25: warning: no local-path-provisioner Deployment in namespace local-path-storage"
fi
