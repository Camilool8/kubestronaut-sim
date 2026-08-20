#!/usr/bin/env bash
set -euo pipefail

NS=aquila
NODE=sim-worker4
DEP=telemetry-collector
TAINT=q06-dedicated=telemetry:NoSchedule
REPLICAS=2

kubectl create ns "$NS" --dry-run=client -o yaml | kubectl apply -f -

# The node object can be missing for a few seconds at seed time: a previous
# attempt may have deleted it (kubelet re-registers within seconds), and on a
# cold boot the workers join while the earlier questions are still seeding.
# Wait a bounded while rather than failing the whole prepare over a race.
for _ in $(seq 1 20); do
  kubectl get node "$NODE" >/dev/null 2>&1 && break
  sleep 3
done

if kubectl get node "$NODE" >/dev/null 2>&1; then
  # The taint is the seed's, not the candidate's: it is what makes this node
  # exclusively $DEP's, so "no non-DaemonSet Pod is left here" grades the
  # candidate's drain rather than whatever the scheduler happened to put here.
  # The key is prefixed with the question id because a node taint is
  # cluster-scoped state two questions could otherwise collide on — workload=batch
  # belongs to q21 on sim-worker2. --overwrite makes the re-run a no-op instead
  # of "node already has a taint with key ...".
  kubectl taint nodes "$NODE" "$TAINT" --overwrite >/dev/null

  # What makes a RESET a reset. The graded answer here is a cordoned, empty
  # node, so an attempt leaves .spec.unschedulable=true behind; without this the
  # re-seeded Deployment would have nowhere to put its Pods and the question
  # would open already half-solved, with its first criterion true before anyone
  # touched it. Uncordoning a schedulable node is a no-op.
  kubectl uncordon "$NODE" >/dev/null
else
  echo "q06 setup: node $NODE is not registered — seeding the workload anyway" >&2
fi

# kubectl apply restores every field this manifest names, but a field the
# candidate ADDED is in neither the previous last-applied-configuration nor this
# manifest, so a three-way merge keeps it. An affinity term or a second
# nodeSelector key added while chasing the Pending Pods would survive the
# re-seed and change where the Pods land, so drift is nulled out first.
# Conditional, because the patch itself rolls the Deployment: on the untouched
# seed — the common warm re-run — nothing is written and the apply below reports
# "unchanged".
#
# `|| drift=no` is load-bearing: on the cold path the Deployment does not exist,
# kubectl exits 1, and under `set -e` with `pipefail` an assignment from a
# failing pipeline ends the script — killing the seed on a fresh cluster at the
# line written to handle a re-seed.
drift=$(kubectl -n "$NS" get deploy "$DEP" -o json 2>/dev/null \
  | jq -r --arg node "$NODE" '.spec.template.spec
      | if .affinity != null or (.nodeName // "") != ""
           or (.nodeSelector // {}) != {"kubernetes.io/hostname": $node}
        then "yes" else "no" end' 2>/dev/null) || drift=no
if [ "${drift:-no}" = yes ]; then
  kubectl -n "$NS" patch deploy "$DEP" --type=merge -p \
    '{"spec":{"template":{"spec":{"nodeSelector":null,"affinity":null,"nodeName":null}}}}' \
    >/dev/null 2>&1 || true
fi

# The pin, not the toleration, is what makes the seeded placement the same on
# every run. A toleration only PERMITS a Pod on the tainted node; the scheduler
# would still be free to put these two anywhere in the cluster, and then "no
# non-DaemonSet Pod is left on $NODE" would be true by luck on some fraction of
# fresh environments — free points, and an intermittent "fresh env should score
# 0". Pinned by hostname, both Pods are on $NODE at seed and every criterion in
# this question is deterministically false until the candidate drains it.
#
# The emptyDir is the second half of the exercise: kubectl drain refuses to
# evict a Pod with local scratch storage until it is told to
# --delete-emptydir-data, exactly as the DaemonSet Pods on every node force
# --ignore-daemonsets. A short grace period keeps the eviction from spending
# 30 s per Pod on a shell that ignores SIGTERM.
kubectl -n "$NS" apply -f - <<EOF
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
      nodeSelector:
        kubernetes.io/hostname: $NODE
      tolerations:
        - key: q06-dedicated
          operator: Equal
          value: telemetry
          effect: NoSchedule
      volumes:
        - name: spool
          emptyDir: {}
      containers:
        - name: collector
          image: busybox:1.37
          command: ["sh", "-c"]
          args:
            - |
              while true; do
                echo "\$(date) node=\$(hostname) samples=42" >> /var/log/telemetry/spool.log
                sleep 20
              done
          volumeMounts:
            - name: spool
              mountPath: /var/log/telemetry
          resources:
            requests: {cpu: 10m, memory: 16Mi}
EOF

# Bounded, and a failure here is not fatal: the seed is correct the moment the
# objects exist, and every criterion reads the API rather than this wait. Waiting
# at all is for the candidate's sake — a question about emptying a node reads
# badly if nothing has been placed on it yet when they open it.
kubectl -n "$NS" rollout status "deploy/$DEP" --timeout=90s >/dev/null 2>&1 || true
