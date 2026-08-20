#!/usr/bin/env bash
set -euo pipefail

NS=norma
NODE=sim-worker
HOSTDIR=/mnt/q24-audit
FILE=audit.log
SEAL=q24-8b31fd
SC=q24-audit
PV=q24-audit-pv
CLAIM=audit-data
DEP=audit-viewer
MOUNT=/srv/audit
STAGE=q24-stage-audit
REC=q24-inventory

kubectl create ns "$NS" --dry-run=client -o yaml | kubectl apply -f -

# ---------------------------------------------------------------- the payload
#
# The one thing the candidate cannot be asked to invent: the audit trail itself,
# sitting in a directory on a node, which is what makes "the volume still holds
# the data" a fact rather than a story.
#
# This script runs inside k8s-env with a kubeconfig and nothing else — it is not
# on the node and has no shell there. The API-only way to write to a node's
# filesystem is to have the cluster do it: a Pod pinned to that node with a
# hostPath volume of type DirectoryOrCreate, which makes the kubelet create the
# directory before the container starts. (`docker exec` into the kind node would
# also work from here and is rejected deliberately: it would tie the bank to the
# dind topology the environment happens to use today.)
#
# Writing through a hostPath rather than through the PersistentVolume itself is
# the deliberate choice this question turns on. The seed has to restore the
# payload on every re-run, including a re-run on a cluster where the candidate
# has already bound the volume to a claim of their own — and writing through the
# volume would mean binding it first, which means clearing and re-forging its
# claimRef, which is the very state being seeded. A hostPath writer is
# independent of the volume's binding state, so the data can always be restored
# without the PersistentVolume OBJECT being touched at all. That matters here
# beyond convenience: the object's uid is this question's identity record, and a
# seed that ever deleted and recreated the volume would invalidate it.
#
# sim-worker and only sim-worker: it is the one general-purpose worker. The
# candidate taints sim-worker2 in q21 and drains sim-worker4 in q06, and q07
# stops the kubelet on sim-worker3 — a volume pinned to any of those makes this
# question unsolvable whenever the owning question is drawn beside it. The
# control plane carries a NoSchedule taint.
#
# A Pod's spec is immutable, so this is delete-then-create rather than apply: a
# leftover Succeeded Pod from the previous run would keep its old command.
stage() {
  kubectl -n "$NS" delete pod "$STAGE" --ignore-not-found --timeout=60s >/dev/null 2>&1 || true
  kubectl -n "$NS" apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: $STAGE
  namespace: $NS
  labels: {app: q24-stage}
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
          printf '%s\n' \
            'audit trail - norma settlement service (decommissioned)' \
            'period: 2026-Q1' \
            'entries: 30717' \
            'seal: $SEAL' > /host/$FILE
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
  kubectl -n "$NS" wait --for=jsonpath='{.status.phase}'=Succeeded "pod/$STAGE" \
    --timeout="$1" >/dev/null 2>&1
}

# Two attempts, because the whole question rests on this file existing and one
# scheduling hiccup should not decide it. busybox:1.37 is preloaded on the
# nodes, so the usual cost is a few seconds; both waits together stay well
# inside the per-question seed budget — 600 s preparing an attempt, 240 s for
# a Training re-seed. Warm re-runs pay it again on
# purpose — the write is idempotent and it restores a trail a previous candidate
# may have edited through the mount.
if ! stage 90s; then
  stage 60s || {
    echo "q24 setup: could not stage $HOSTDIR/$FILE on $NODE" >&2
    kubectl -n "$NS" describe "pod/$STAGE" >&2 2>/dev/null || true
    exit 1
  }
fi

# Left behind, a Completed Pod in the candidate's namespace would show them a
# hostPath answer to a question about a PersistentVolume.
kubectl -n "$NS" delete pod "$STAGE" --ignore-not-found --timeout=60s >/dev/null 2>&1 || true

# ------------------------------------------------------------------ the class
#
# No provisioner: nothing in this cluster creates volumes on this class, which
# is what keeps a claim written against it from being served by the cluster's
# default class instead. Immediate rather than WaitForFirstConsumer, and
# deliberately: binding then happens the moment the claim and an Available
# volume exist, so clearing the claimRef and writing the claim is a milestone
# the candidate can finish and see, independently of the Deployment they have
# still to edit. (q23 is the question that teaches WaitForFirstConsumer.)
#
# Every field on a StorageClass is immutable, so this apply is a no-op on every
# warm re-run rather than an update.
kubectl apply -f - >/dev/null <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: $SC
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: Immediate
EOF

# ------------------------------------------------------------- reset the state
#
# What follows is the reseed path. setup.sh re-runs on a reset and on a
# per-question reseed, and a reseed happens on a cluster the candidate may have
# already solved this on, so their answer has to be unwound. The order is
# forced: a claim held by a Pod blocks on its pvc-protection finalizer until the
# Pod is gone, so the Deployment goes first and the claims after it.
#
# The Deployment is only torn down when it has drifted from the seeded shape.
# On the common warm path — an untouched seed — nothing is written, and the
# apply further down reports "unchanged". A three-way merge cannot do this job:
# a candidate who changes the volume's SOURCE leaves a live object carrying both
# a persistentVolumeClaim and (from this manifest) an emptyDir, which the API
# rejects as two volume types in one volume. Delete and recreate is exact.
# `|| shape=absent` is what the default in the test below is written for: on the
# cold path there is no Deployment, kubectl exits 1, and under `set -e` with
# `pipefail` an assignment from a failing pipeline ends the script before the
# default is ever consulted.
shape=$(kubectl -n "$NS" get deploy "$DEP" -o json 2>/dev/null | jq -r '
  .spec.template.spec.volumes // []
  | if length == 1 and all(.[]; .name == "audit" and has("emptyDir"))
    then "seeded" else "drifted" end' 2>/dev/null) || shape=absent
if [ "${shape:-absent}" = drifted ]; then
  kubectl -n "$NS" delete deploy "$DEP" --ignore-not-found --timeout=90s >/dev/null 2>&1 || true
  kubectl -n "$NS" wait --for=delete pod -l app="$DEP" --timeout=90s >/dev/null 2>&1 || true
fi

# Every claim that could be holding this volume: the pinned name the question
# asks for, and anything else the candidate bound to it under a name of their
# own. Names are read off the claims rather than guessed.
holders=$(kubectl -n "$NS" get pvc -o json 2>/dev/null \
  | jq -r --arg pv "$PV" --arg c "$CLAIM" \
      '[.items[]? | select(.spec.volumeName == $pv or .metadata.name == $c) | .metadata.name]
       | unique | join(" ")' 2>/dev/null) || holders=''
for pvc in ${holders:-}; do
  kubectl -n "$NS" delete pvc "$pvc" --ignore-not-found --timeout=90s >/dev/null 2>&1 || true
done

# ----------------------------------------------------------------- the volume
#
# Created here, and — on every path that is not a candidate deleting it —
# created exactly once in the life of the cluster. The apply is what repairs a
# volume whose spec was edited; if the edit was to an immutable field
# (spec.local, spec.nodeAffinity and the volume mode are all immutable after
# creation) the apply is rejected, and the only way back is to replace the
# object. That is the one path on which the uid changes, and the inventory
# record written at the end of this script is refreshed from the live object
# precisely so that a reseed re-baselines rather than accusing the next
# candidate of something the seed did.
apply_pv() {
  kubectl apply -f - >/dev/null <<EOF
apiVersion: v1
kind: PersistentVolume
metadata:
  name: $PV
  labels: {app: q24-audit}
spec:
  capacity:
    storage: 1Gi
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: $SC
  local:
    path: $HOSTDIR
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: In
              values: [$NODE]
EOF
}
if ! apply_pv; then
  kubectl delete pv "$PV" --ignore-not-found --timeout=90s >/dev/null 2>&1 || true
  apply_pv
fi

pv_field() { kubectl get pv "$PV" -o jsonpath="{$1}" 2>/dev/null || true; }

live_uid=$(pv_field .metadata.uid)

# Nothing below this line means anything without the volume, and a question that
# cannot be solved should fail the seed rather than reach a candidate.
[ -n "$live_uid" ] || {
  echo "q24 setup: $PV does not exist after apply" >&2
  exit 1
}

# ------------------------------------------------------ the stale reservation
#
# The state the question is about: Released, with spec.claimRef still naming a
# claim that no longer exists. A PersistentVolume in that state never rebinds on
# its own — not to a new claim of the same name, not to anything — and Retain
# means nothing ever clears it either.
#
# The uid in that claimRef is the whole trap, so on a cold cluster it is a real
# one: a claim is created against the volume, allowed to bind, and deleted. That
# also proves at seed time that this volume binds and releases exactly as the
# candidate's answer will need it to. On a warm re-run the same value is read
# back out of the inventory record and patched in, so the seeded state is
# identical every time AND the volume object itself is never replaced.
rec=$(kubectl -n "$NS" get cm "$REC" -o json 2>/dev/null || true)
claim_uid=$(printf '%s' "${rec:-null}" | jq -r --arg u "$live_uid" \
  'if (.data.volumeUid // "") == $u then (.data.claimUid // "") else "" end' 2>/dev/null) || claim_uid=''

mint_claim_uid() {
  kubectl patch pv "$PV" --type=merge -p '{"spec":{"claimRef":null}}' >/dev/null 2>&1 || true
  kubectl apply -f - >/dev/null <<EOF || return 1
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
    [ "$(kubectl -n "$NS" get pvc "$CLAIM" -o jsonpath='{.status.phase}' 2>/dev/null)" = Bound ] && break
    sleep 2
  done
  kubectl -n "$NS" delete pvc "$CLAIM" --ignore-not-found --timeout=90s >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do
    [ "$(pv_field .status.phase)" = Released ] && break
    sleep 2
  done
  claim_uid=$(pv_field .spec.claimRef.uid)
  [ -n "$claim_uid" ]
}

if [ -z "$claim_uid" ]; then
  # A uid the API server never issued is indistinguishable from one it did —
  # both are just a string in claimRef that no live claim matches — so this is
  # a fallback rather than a compromise, taken only when a real bind could not
  # be had (something else is holding the volume).
  #
  # Loud, because this is also the seed's own test of the one thing the
  # question assumes: that a claim on this class binds to this volume and
  # releases it again. If that ever stops being true the fallback keeps the
  # question seeded and correct, and this line is what says so.
  mint_claim_uid || {
    claim_uid=$(cat /proc/sys/kernel/random/uuid)
    echo "q24: warning: a probe claim did not bind to $PV; seeding a synthetic claimRef uid" >&2
  }
fi

# Asserted rather than assumed: whatever happened above, the volume ends this
# script reserved for a claim that does not exist. Patching claimRef is the same
# operation the candidate has to reverse, run in the other direction.
ensure_released() {
  local want="$NS/$CLAIM/$1"
  local have
  have=$(kubectl get pv "$PV" \
    -o jsonpath='{.spec.claimRef.namespace}/{.spec.claimRef.name}/{.spec.claimRef.uid}' 2>/dev/null || true)
  if [ "$have" != "$want" ]; then
    kubectl patch pv "$PV" --type=merge -p \
      "{\"spec\":{\"claimRef\":{\"apiVersion\":\"v1\",\"kind\":\"PersistentVolumeClaim\",\"namespace\":\"$NS\",\"name\":\"$CLAIM\",\"uid\":\"$1\"}}}" \
      >/dev/null
  fi
  for _ in $(seq 1 20); do
    [ "$(pv_field .status.phase)" = Released ] && return 0
    sleep 2
  done
  return 1
}

if ! ensure_released "$claim_uid"; then
  claim_uid=$(cat /proc/sys/kernel/random/uuid)
  ensure_released "$claim_uid" || echo \
    "q24: warning: $PV is '$(pv_field .status.phase)' after seeding, expected Released" >&2
fi

# ------------------------------------------------------------- the Deployment
#
# Storage the candidate has to replace, not storage they have to add: the mount
# path already exists and is already backed by something, and what is wrong with
# it is where it comes from. The container says so in its log on every loop,
# which is the breadcrumb for a candidate who starts from `kubectl logs`.
#
# Recreate rather than a rolling update: one Pod at a time is the honest
# strategy for a ReadWriteOnce volume pinned to a single node, and it keeps the
# grader from ever having to choose between two live Pods on different templates.
kubectl apply -f - >/dev/null <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $DEP
  namespace: $NS
  labels: {app: $DEP}
spec:
  replicas: 1
  strategy: {type: Recreate}
  selector:
    matchLabels: {app: $DEP}
  template:
    metadata:
      labels: {app: $DEP}
    spec:
      containers:
        - name: viewer
          image: busybox:1.37
          command: ["sh", "-c"]
          args:
            - |
              while true; do
                if [ -f $MOUNT/$FILE ]; then
                  echo "audit-viewer: serving \$(wc -l < $MOUNT/$FILE) lines from $MOUNT/$FILE"
                else
                  echo "audit-viewer: nothing at $MOUNT/$FILE - the audit trail is not mounted"
                fi
                sleep 30
              done
          volumeMounts:
            - name: audit
              mountPath: $MOUNT
          resources:
            requests: {cpu: 10m, memory: 16Mi}
      volumes:
        - name: audit
          emptyDir: {}
EOF

# --------------------------------------------------------- the identity record
#
# Written last, from the live object, and this is the piece the question's one
# forbidden action is graded against.
#
# "The same volume, not a replacement" cannot be graded by name: a candidate who
# deletes this PersistentVolume and creates another one pointing at the same
# directory gets back the same name AND the same bytes, so neither the name nor
# the trail can tell the two apart. The uid can — the API server issues it on
# create and no client can choose it — but only against something recorded
# before the fact. This ConfigMap is that record.
#
# It is deliberately visible and deliberately named in question.md, rather than
# hidden somewhere the candidate would trip over it: a stray object in their own
# namespace that they are silently graded against is a trap, whereas a
# provisioning record they are told not to edit is how a real storage team would
# hold the same fact.
kubectl -n "$NS" create configmap "$REC" \
  --from-literal=volume="$PV" \
  --from-literal=volumeUid="$live_uid" \
  --from-literal=provisioned="$(pv_field .metadata.creationTimestamp)" \
  --from-literal=claim="$NS/$CLAIM" \
  --from-literal=claimUid="$claim_uid" \
  --from-literal=node="$NODE" \
  --from-literal=path="$HOSTDIR" \
  --from-literal=seal="$SEAL" \
  --from-literal=reclaimPolicy=Retain \
  --from-literal=note="Storage inventory record for the norma audit trail, taken when the volume was provisioned. The volume audit compares the live PersistentVolume against volumeUid. Do not edit." \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# Bounded and non-fatal: every check reads the API rather than this wait, and
# the seed is correct the moment the objects exist. Waiting at all is for the
# candidate's sake, so the Deployment is up when they open the question.
kubectl -n "$NS" rollout status "deploy/$DEP" --timeout=120s >/dev/null 2>&1 || true
