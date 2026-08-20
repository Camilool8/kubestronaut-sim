#!/usr/bin/env bash
set -euo pipefail

NS=mensa
NODE=sim-worker
HOSTDIR=/mnt/q23-data
FILE=report.txt
TOKEN=q23-9f3c1a
SEED=q23-stage-report

SC=q23-local
PV=q23-report-pv
PVC=report-data
POD=report-reader

kubectl create ns "$NS" --dry-run=client -o yaml | kubectl apply -f -

# Everything this question grades is created by the CANDIDATE: the class, the
# PersistentVolume, the claim and the Pod. Nothing below creates any of them,
# because a criterion the seed already satisfies is a point awarded for no work
# and tests/smoke.sh asserts a freshly prepared environment scores zero.
#
# The other direction is what these deletions are for. setup.sh re-runs on a
# reset and on a per-question reseed, and a reseed happens on a cluster the
# candidate has already been working in, so a half-solved or fully-solved
# answer would survive into what is meant to be a fresh start. The order is
# forced: a claim in use by a Pod blocks on its pvc-protection finalizer until
# the Pod is gone, and a PersistentVolume is only deletable once nothing is
# bound to it. Names that the candidate chose instead of the pinned ones are
# not cleaned up here and do not need to be — every check reads the pinned name
# and nothing else.
#
# Every deletion is bounded and none of them is fatal. On the ordinary path —
# nothing there, or the candidate's own four objects — the whole block costs a
# few seconds; the timeouts exist so that a claim held by some other Pod the
# candidate made cannot spend this question's entire seed budget waiting
# on a finalizer that is not going to clear.
kubectl -n "$NS" delete pod "$POD" --ignore-not-found --timeout=45s >/dev/null 2>&1 || true
kubectl -n "$NS" delete pvc "$PVC" --ignore-not-found --timeout=30s >/dev/null 2>&1 || true
kubectl delete pv "$PV" --ignore-not-found --timeout=20s >/dev/null 2>&1 || true
kubectl delete storageclass "$SC" --ignore-not-found --timeout=10s >/dev/null 2>&1 || true

# The one piece of state the candidate cannot be asked to invent: the directory
# the local PersistentVolume publishes, and the report inside it.
#
# A `local` volume is a path on a node, and the kubelet refuses to mount one
# that does not exist — so without this the candidate's answer could be
# letter-perfect and their Pod would still sit in ContainerCreating on a
# FailedMount. This script runs inside k8s-env with a kubeconfig and nothing
# else: it is not on the node and has no shell there. The API-only way to write
# to a node's filesystem is to have the cluster do it — a Pod pinned to that
# node with a hostPath volume of type DirectoryOrCreate, which makes the
# kubelet create the directory before the container starts. The container then
# writes the report and exits.
#
# `docker exec` into the kind node container would also work from here, and is
# rejected deliberately: it would tie this bank to the dind topology the
# environment happens to use today, and setup.sh is meant to hold nothing but
# cluster API calls.
#
# sim-worker, and only sim-worker: it is the one general-purpose worker.
# sim-worker2 is tainted by the candidate in q21, q07 stops the kubelet on
# sim-worker3, and the candidate drains sim-worker4 in q06 — a local volume
# pinned to any of those makes this question unsolvable whenever the owning
# question is drawn alongside it. The control plane carries a NoSchedule taint.
#
# A Pod's spec is immutable, so this is delete-then-create rather than apply:
# re-running the seed with any change at all would be rejected as an invalid
# update, and a leftover Succeeded Pod from the previous run would keep its old
# command.
stage() {
  kubectl -n "$NS" delete pod "$SEED" --ignore-not-found --timeout=30s >/dev/null 2>&1 || true
  kubectl -n "$NS" apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: $SEED
  namespace: $NS
  labels: {app: q23-stage}
spec:
  restartPolicy: Never
  nodeSelector:
    kubernetes.io/hostname: $NODE
  containers:
    - name: stage
      image: busybox:1.37
      command: ["sh", "-c"]
      args:
        - |
          set -e
          printf '%s\n' 'nightly report - staged on $NODE' 'records: 4211' 'token: $TOKEN' > /host/$FILE
          chmod 0644 /host/$FILE
          ls -l /host
      volumeMounts:
        - name: host
          mountPath: /host
      resources:
        requests: {cpu: 10m, memory: 16Mi}
  volumes:
    - name: host
      hostPath:
        path: $HOSTDIR
        type: DirectoryOrCreate
EOF
  kubectl -n "$NS" wait --for=jsonpath='{.status.phase}'=Succeeded "pod/$SEED" \
    --timeout="$1" >/dev/null 2>&1
}

# Two attempts, because the whole question rests on this directory existing and
# a single scheduling hiccup should not decide it. busybox:1.37 is preloaded on
# the nodes, so the usual cost is a handful of seconds and both waits together
# sit well inside the per-question seed budget — 600 s preparing an attempt,
# 240 s for a Training re-seed. Warm re-runs pay it again
# on purpose: the write is idempotent and it restores a report a previous
# candidate may have edited.
if ! stage 60s; then
  stage 45s || {
    echo "q23 setup: could not stage $HOSTDIR/$FILE on $NODE" >&2
    kubectl -n "$NS" describe "pod/$SEED" >&2 || true
    exit 1
  }
fi

# The staging Pod has done its work and is not part of the question. Left
# behind it would be a Completed Pod in the candidate's namespace showing them
# a hostPath answer to a question about local PersistentVolumes.
kubectl -n "$NS" delete pod "$SEED" --ignore-not-found --timeout=30s >/dev/null 2>&1 || true
