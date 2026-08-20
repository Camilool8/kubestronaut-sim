#!/usr/bin/env bash
set -euo pipefail
. /banks/_lib/aux.sh

# q26 seeds the aux-etcd cluster with the shape a restore exercise needs and
# nothing more: a marker object, a snapshot of the cluster TAKEN WHILE THAT
# OBJECT EXISTED, and then the object deleted again. The order is the whole
# design. A save-then-delete-then-restore question that leaves the object in
# place at seed time would open with its own criterion already true — "fresh env
# should score 0" in tests/smoke.sh is asserted against every drawn question —
# so the seed ends with the marker GONE and the staged snapshot as the only way
# back to it.
CLUSTER=aux-etcd
NS=q26-fleet
CM=fleet-registry
REGION=eu-west-3
SERIAL=7f3c9a21d4e8
BACKUP_DIR=/opt/backup
NIGHTLY="${BACKUP_DIR}/etcd-nightly.db"
CANDIDATE_SNAP="${BACKUP_DIR}/etcd-before-restore.db"
# What a kind node runs etcd from before anybody has restored anything. One
# criterion is that etcd is NO LONGER serving this directory, so the seed has to
# guarantee it is serving it — asserted at the end rather than assumed.
SEEDED_DIR=/var/lib/etcd

# Never the published /shared kubeconfig: that one points at the k8s-env
# hostname for the instances, and k8s-env's own name does not resolve to itself
# in every session shape. kind emits the 0.0.0.0 form, which connects locally.
KCFG=/tmp/q26-aux-etcd.kubeconfig

k() { kubectl --kubeconfig "$KCFG" --request-timeout=15s "$@"; }

api_ready() {
  kind get kubeconfig --name "$CLUSTER" > "$KCFG" 2>/dev/null || return 1
  kubectl --kubeconfig "$KCFG" --request-timeout=5s get --raw /readyz >/dev/null 2>&1
}

# The directory on the node that the etcd static Pod is running from, read
# through the mirror Pod the kubelet publishes. Bounded retries because the
# mirror can be a few seconds behind an API server that has only just started,
# and an empty answer here is read as drift.
etcd_datadir() {
  local dir='' _
  for _ in 1 2 3 4 5; do
    dir=$(k -n kube-system get pod -l component=etcd \
      -o jsonpath='{.items[*].spec.volumes[?(@.name=="etcd-data")].hostPath.path}' 2>/dev/null || true)
    [ -n "$dir" ] && break
    sleep 3
  done
  printf '%s' "$dir"
}

# The re-break. Every other aux question can undo its own damage cheaply; this
# one cannot always, because the candidate's last act may have been to point
# etcd at a data directory that never comes up. aux_up does not repair a cluster
# it finds — so when the API stays silent, delete this question's own cluster
# and let aux_up build it again. Guarded by an actual health probe, because the
# common warm path (a resume, a Training-mode re-seed of a solved question) must
# stay fast and must not throw away a working cluster.
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  # A resume leaves the node container stopped; that is not a wrecked cluster.
  # Give it its nudge (aux_up's warm path does the same) before judging it.
  for node in $(kind get nodes --name "$CLUSTER" 2>/dev/null || true); do
    if [ "$(docker inspect -f '{{.State.Running}}' "$node" 2>/dev/null)" != "true" ]; then
      docker start "$node" >/dev/null || true
    fi
  done

  ready=''
  deadline=$(( $(date +%s) + 90 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if api_ready; then ready=1; break; fi
    sleep 3
  done

  # Two reasons to throw the cluster away, and neither of them can be undone
  # cheaply. It may not be serving at all — a restore left half-done points etcd
  # at files that never come up. Or it may be serving perfectly from a directory
  # the LAST candidate restored into, in which case "etcd no longer runs from
  # the seeded directory" would already be true and this question would open
  # with a point earned. Pointing it back is not a repair: that directory's
  # contents are older than the cluster's own state. A one-node kind cluster
  # rebuilds in about ten seconds, so rebuilding is the cheap, honest answer.
  drifted=''
  if [ -n "$ready" ] && [ "$(etcd_datadir)" != "$SEEDED_DIR" ]; then drifted=1; fi

  if [ -z "$ready" ] || [ -n "$drifted" ]; then
    echo "q26 setup: ${CLUSTER} is not in its seeded shape (serving=${ready:-no}, drifted data dir=${drifted:-no}) — building it again"
    kind delete cluster --name "$CLUSTER" >/dev/null 2>&1 || true
  fi
fi

aux_up etcd
kind get kubeconfig --name "$CLUSTER" > "$KCFG"

node=$(kind get nodes --name "$CLUSTER" | head -1)
[ -n "$node" ] || { echo "q26 setup: ${CLUSTER} has no node" >&2; exit 1; }

# 1. The marker, back in place. apply rather than create: the previous attempt
#    may have restored it, edited it, or left the Namespace behind empty.
manifest=$(mktemp)
cat > "$manifest" <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: ${NS}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${CM}
  namespace: ${NS}
data:
  region: "${REGION}"
  serial: "${SERIAL}"
EOF

# A Namespace the last candidate deleted can still be Terminating, and an apply
# into a Terminating Namespace is rejected until it finishes. Retry rather than
# fail the whole prepare over a few seconds of finalisation.
applied=''
for _ in $(seq 1 12); do
  if k apply -f "$manifest" >/dev/null 2>&1; then applied=1; break; fi
  sleep 5
done
rm -f "$manifest"
[ -n "$applied" ] || { echo "q26 setup: could not seed ${NS}/${CM} on ${CLUSTER}" >&2; exit 1; }

# 2. Read it back before snapshotting. The snapshot is only useful if the write
#    is in etcd, and the API answering with the value is the proof of that.
seeded=$(k -n "$NS" get cm "$CM" -o jsonpath='{.data.serial}' 2>/dev/null || true)
[ "$seeded" = "$SERIAL" ] || {
  echo "q26 setup: ${NS}/${CM} did not come back with its data — got '${seeded}'" >&2
  exit 1
}

# 3. The backup the candidate will restore from, taken from the node itself.
#    docker here is the inner dockerd that runs the kind nodes; a setup is not a
#    grader, so reaching into the node is ordinary. Written to a temp name and
#    renamed only once etcdutl agrees it is a snapshot, so a half-written file
#    can never be the thing a candidate is told to trust. etcd 3.6 split the
#    subcommands: save is etcdctl (it is an online, authenticated call), status
#    and restore are etcdutl (they only read the file).
docker exec "$node" sh -c "
  set -e
  mkdir -p ${BACKUP_DIR}
  rm -f ${NIGHTLY}.part ${NIGHTLY}.tmp
  etcdctl --endpoints=https://127.0.0.1:2379 \
    --cacert=/etc/kubernetes/pki/etcd/ca.crt \
    --cert=/etc/kubernetes/pki/etcd/server.crt \
    --key=/etc/kubernetes/pki/etcd/server.key \
    snapshot save ${NIGHTLY}.tmp >/dev/null 2>&1
  etcdutl -w json snapshot status ${NIGHTLY}.tmp >/dev/null
  mv ${NIGHTLY}.tmp ${NIGHTLY}
"

# 4. The incident itself. Only the ConfigMap goes: the Namespace stays so the
#    candidate can see for themselves that the object, not its home, is missing.
k -n "$NS" delete cm "$CM" --ignore-not-found >/dev/null

# 5. Nothing of a previous attempt may be left where a criterion reads. The
#    candidate's own snapshot path is graded, so it starts absent on every
#    re-seed — otherwise a Training re-seed would hand back a point that was
#    earned in the previous attempt. Restored DATA directories are deliberately
#    left alone — deleting a directory etcd might be mounting is how a seed
#    breaks the cluster it was meant to prepare, and the guard above has already
#    rebuilt any cluster that was serving one of them.
docker exec "$node" sh -c "rm -f ${CANDIDATE_SNAP} ${NIGHTLY}.part"

# 6. The last criterion is that etcd has been moved OFF this directory, so the
#    seed is only correct if etcd is on it. Asserted rather than assumed: if a
#    future node image ever changed where kubeadm puts etcd's data, the question
#    would open with that point already earned and the only symptom anywhere
#    would be tests/smoke.sh's "fresh env should score 0".
live_dir=$(etcd_datadir)
[ "$live_dir" = "$SEEDED_DIR" ] || {
  echo "q26 setup: ${CLUSTER} runs etcd from '${live_dir}', not ${SEEDED_DIR} — the data-dir criterion would open already true" >&2
  exit 1
}

echo "q26 setup: ${CLUSTER} seeded — ${NS}/${CM} deleted, backup staged at ${NIGHTLY}"
