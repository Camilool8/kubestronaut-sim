#!/usr/bin/env bash
set -euo pipefail

# q05 seeds the aux-sched cluster: the kube-scheduler static Pod manifest is
# left pointing --kubeconfig at a file that does not exist, so the scheduler
# exits during startup and never reaches leader election, and a three-replica
# Deployment is left with nowhere to be placed. Everything here runs on k8s-env
# as root, where `docker` talks to the inner dockerd that runs the kind node
# containers.
#
# shellcheck source=/dev/null
. /banks/_lib/aux.sh

AUX=sched
CLUSTER=aux-sched
KCFG=/tmp/q05-aux-sched.kubeconfig
MANIFEST=/etc/kubernetes/manifests/kube-scheduler.yaml

# A wrong PATH rather than mangled YAML, because the two fail in very different
# ways: a manifest the kubelet cannot parse is dropped without a Pod ever being
# created, leaving the candidate a missing object and no logs to read, while a
# flag the scheduler cannot satisfy leaves a mirror Pod in CrashLoopBackOff
# whose log says exactly what is wrong. The leading "- " anchors the
# substitution to the YAML list item: without it the same text also sits inside
# --authentication-kubeconfig= and --authorization-kubeconfig=, and breaking
# three flags at once turns a legible fault into a puzzle.
GOOD='- --kubeconfig=/etc/kubernetes/scheduler.conf'
BAD='- --kubeconfig=/etc/kubernetes/scheduler-backup.conf'

NS=default
DEP=orbit-planner
REPLICAS=3
IMAGE=busybox:1.37

# The published kubeconfig under /shared points at https://k8s-env:<port>, and
# k8s-env's own name does not resolve to itself in every session shape. kind
# emits the 0.0.0.0 form, which connects locally — the same reasoning aux_up
# uses for its own readiness probe.
publish_local_kubeconfig() {
  kind get kubeconfig --name "$CLUSTER" > "$KCFG"
}

kaux() {
  kubectl --kubeconfig "$KCFG" "$@"
}

aux_node() {
  kind get nodes --name "$CLUSTER" 2>/dev/null | head -1
}

manifest_text() {
  local node
  node=$(aux_node || true)
  [ -n "$node" ] || return 0
  docker exec "$node" cat "$MANIFEST" 2>/dev/null || true
}

# healthy = the seeded file, broken = already carrying this question's typo,
# unusable = neither, which is what a candidate's rewrite or deletion leaves.
manifest_state() {
  local text
  text=$(manifest_text)
  case "$text" in
    *"$BAD"*) printf 'broken' ;;
    *"$GOOD"*) printf 'healthy' ;;
    *) printf 'unusable' ;;
  esac
}

# How many kube-scheduler Pods the aux API currently reports as Ready. Reading
# it back is what stops the seed racing itself: a scheduler that is still up
# when the Deployment lands would place all three Pods and the question would
# open already solved. Selected the same way the graders select it — by
# kubeadm's label, falling back to the name — so a scheduler an earlier
# candidate re-created without labels is still seen here.
sched_ready() {
  local out n
  out=$(kaux -n kube-system get pods -o json 2>/dev/null || true)
  [ -n "$out" ] || out='{}'
  n=$(printf '%s' "$out" | jq '[ .items[]?
        | select(.metadata.deletionTimestamp == null)
        | select((.metadata.labels.component == "kube-scheduler")
                 or ((.metadata.name // "") | startswith("kube-scheduler")))
        | select(any(.status.conditions[]?; .type == "Ready" and .status == "True")) ]
      | length' 2>/dev/null) || n=0
  printf '%s' "${n:-0}"
}

recreate_cluster() {
  kind delete cluster --name "$CLUSTER" || true
  aux_up "$AUX"
  publish_local_kubeconfig
}

apply_break() {
  local node
  case "$1" in
    healthy)
      node=$(aux_node || true)
      if [ -z "$node" ]; then
        echo "q05 setup: $CLUSTER has no node container to edit" >&2
        exit 1
      fi
      docker exec "$node" sed -i "s|${GOOD}|${BAD}|" "$MANIFEST"
      echo "q05 setup: repointed the kube-scheduler --kubeconfig flag on $node"
      ;;
    broken) ;;
    *)
      echo "q05 setup: a freshly created $CLUSTER has no '$GOOD' line in $MANIFEST" >&2
      exit 1
      ;;
  esac
}

# The kubelet watches the manifest directory and also re-reads it on a timer, so
# a running scheduler survives the edit for a moment. Nothing schedulable may
# exist until it is actually down.
wait_scheduler_down() {
  local deadline
  # Measured at about 8s on this image for the kubelet to notice the edit and
  # put the container into CrashLoopBackOff. The bound is generous rather than
  # patient: this runs at most twice, and both runs plus a cold recreate have to
  # fit the per-question seed budget (600s preparing an attempt, 240s for a
  # Training re-seed, which is always the warm path).
  deadline=$(( $(date +%s) + 60 ))
  while [ "$(sched_ready)" != 0 ]; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      return 1
    fi
    sleep 3
  done
}

aux_up "$AUX"
publish_local_kubeconfig

# Section C of the wave contract: re-break cheaply where you can, and where you
# cannot, delete and recreate your own aux cluster. Editing the flag back is the
# cheap path and covers the common cases — a fresh cluster, and a Training
# re-seed of a question somebody solved. A manifest that is neither the seeded
# file nor this question's break is one a previous candidate rewrote or removed,
# and there is nothing left to edit. The guard keeps that expensive path off the
# warm run; on this image a cold aux_up is about ten seconds anyway.
state=$(manifest_state)
if [ "$state" = unusable ]; then
  echo "q05 setup: $MANIFEST is neither the seeded file nor this question's break — recreating $CLUSTER"
  recreate_cluster
  state=$(manifest_state)
fi
apply_break "$state"

# A scheduler still serving after the re-break means something is running that
# this question did not write — a second copy of the flag, a manifest under
# another name, a scheduler started some other way. The file cannot be edited
# back into a state nobody can predict, so take the one re-break that always
# works.
if ! wait_scheduler_down; then
  echo "q05 setup: $CLUSTER still schedules after its manifest was broken — recreating it" >&2
  recreate_cluster
  apply_break "$(manifest_state)"
  if ! wait_scheduler_down; then
    echo "q05 setup: kube-scheduler on a freshly created $CLUSTER will not stay down" >&2
    exit 1
  fi
fi

# Leader election writes a Lease, and the one the scheduler held before the
# break would otherwise still be sitting there — "a kube-scheduler holds the
# lease" has to be false on the seeded cluster, or it is a point awarded for an
# untouched environment. A repaired scheduler creates it again on startup.
kaux -n kube-system delete lease kube-scheduler --ignore-not-found >/dev/null 2>&1 || true

# An aux cluster's containerd holds only the control-plane images, so a Pod
# whose image is not loaded sits in ImagePullBackOff for reasons that have
# nothing to do with the scheduler. Guarded, because the load is the slow half
# and a warm re-run should not pay it.
if ! _aux_node_has_image "$CLUSTER" "$IMAGE"; then
  _aux_load_image "$CLUSTER" "$IMAGE"
fi

# kubectl apply restores every field this manifest names, but a field the
# candidate ADDED is in neither the previous last-applied-configuration nor this
# manifest, so a three-way merge keeps it. A nodeName or an affinity term added
# while trying to force the Pods onto the node would survive the re-seed and
# place them without a scheduler, which is exactly what this question grades.
# Conditional, because the patch itself rolls the Deployment; on the untouched
# seed nothing is written and the apply below reports "unchanged".
drift=$(kaux -n "$NS" get deploy "$DEP" -o json 2>/dev/null \
  | jq -r '.spec.template.spec
      | if .affinity != null or (.nodeName // "") != "" or (.nodeSelector // {}) != {}
        then "yes" else "no" end' 2>/dev/null) || drift=no
if [ "${drift:-no}" = yes ]; then
  kaux -n "$NS" patch deploy "$DEP" --type=merge -p \
    '{"spec":{"template":{"spec":{"nodeName":null,"nodeSelector":null,"affinity":null}}}}' \
    >/dev/null 2>&1 || true
fi

# The toleration is insurance, not part of the exercise. A single-node kind
# cluster carries no taints once its node is Ready — measured on this image, not
# assumed — so it tolerates nothing that is there today; it costs nothing, and
# this cluster has exactly one node, where a workload that could not run would
# make the question unsolvable rather than hard.
kaux -n "$NS" apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $DEP
  namespace: $NS
spec:
  replicas: $REPLICAS
  selector:
    matchLabels: {app: $DEP}
  template:
    metadata:
      labels: {app: $DEP}
    spec:
      terminationGracePeriodSeconds: 5
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
      containers:
        - name: planner
          image: $IMAGE
          command: ["sh", "-c"]
          args:
            - |
              while true; do
                echo "\$(date) planning window open"
                sleep 30
              done
          resources:
            requests: {cpu: 10m, memory: 16Mi}
EOF

# The other half of the re-seed. On a question that was solved and is being
# re-seeded, the Deployment's Pods are already placed and Running, and apply
# alone changes nothing about them. Deleting them hands the ReplicaSet the job
# of asking for replacements — which, with the scheduler down again, stay
# Pending. Bounded by the list itself, so it is a no-op on the cold path.
placed=$(kaux -n "$NS" get pods -l "app=$DEP" -o json 2>/dev/null \
  | jq -r '[ .items[]?
             | select(.metadata.deletionTimestamp == null)
             | select((.spec.nodeName // "") != "")
             | .metadata.name ] | join(" ")' 2>/dev/null) || placed=''
for pod in $placed; do
  kaux -n "$NS" delete pod "$pod" --wait=false >/dev/null 2>&1 || true
done

# For the candidate's sake only — every criterion reads the API rather than this
# wait, and the seed is correct the moment the objects exist. A question about
# Pods that cannot be placed reads badly if none of them have been created yet
# when it is opened.
for _ in $(seq 1 20); do
  n=$(kaux -n "$NS" get pods -l "app=$DEP" -o json 2>/dev/null \
    | jq '[ .items[]? | select(.metadata.deletionTimestamp == null) ] | length' 2>/dev/null) || n=0
  if [ "${n:-0}" -ge "$REPLICAS" ]; then
    break
  fi
  sleep 3
done
