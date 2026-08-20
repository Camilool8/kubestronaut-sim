#!/usr/bin/env bash
set -euo pipefail

NS=octans
PIN=sim-worker

kubectl create ns "$NS" --dry-run=client -o yaml | kubectl apply -f -

# This question's node work is the CANDIDATE's: nothing here taints or labels
# sim-worker2. A criterion the seed already satisfies is a point awarded for no
# work, and tests/smoke.sh asserts a freshly prepared environment scores zero.
#
# What the seed does have to guarantee is the other direction — that every
# criterion is deterministically FALSE before anyone touches it. Placement is
# the trap: a Deployment seeded without constraints lands wherever the
# scheduler puts it, so "batch-runner's Pods are on sim-worker2" would be true
# on a random subset of runs and false on the rest. Both Deployments are
# therefore pinned by hostname to sim-worker, which is the general worker no
# other question reserves (worker2 is this question's, worker3 q07's, worker4
# q06's). Pinned, the seeded placement is the same on every run: batch-runner
# is NOT on the batch node, and web-frontend — whose Pods must never end up
# there — cannot drift onto it by luck and fail its own do-no-harm gate for the
# candidate.
#
# The pin is also the exercise. Replacing a hostname pin with a taint plus a
# label is the real-world shape of "dedicate a node", and a candidate who adds
# the node affinity while leaving the pin in place gets the lesson the hard way:
# both constraints must hold at once, and no node satisfies both.
#
# The patch before the apply is what makes a RESET a reset. kubectl apply does
# a three-way merge, and a field the candidate ADDED — a toleration, an
# affinity, an extra nodeSelector key — is in neither the previous
# last-applied-configuration nor this manifest, so the merge would keep it and
# re-seed a half-solved question. Setting the three fields to null first
# removes them outright; the apply below then writes the seeded state back.
#
# Conditional, because the patch is not free: it would briefly leave the
# Deployment with no placement constraint at all, rolling out one ReplicaSet on
# the way out and another on the way back. On an untouched seed — the common
# warm re-run — there is nothing to undo, so nothing is written and the apply
# that follows reports "unchanged".
for dep in batch-runner web-frontend; do
  # `|| drift=no` is not tidiness. On the cold path this Deployment does not
  # exist yet, kubectl exits 1, and under `set -e` with `pipefail` an assignment
  # from a failing pipeline ends the script — so the seed would die on a fresh
  # cluster at the exact line that exists to handle a re-seed.
  drift=$(kubectl -n "$NS" get deploy "$dep" -o json 2>/dev/null \
    | jq -r --arg pin "$PIN" '.spec.template.spec
        | if (.tolerations // []) != [] or .affinity != null
             or (.nodeSelector // {}) != {"kubernetes.io/hostname": $pin}
          then "yes" else "no" end' 2>/dev/null) || drift=no
  [ "${drift:-no}" = yes ] || continue
  kubectl -n "$NS" patch deploy "$dep" --type=merge -p \
    '{"spec":{"template":{"spec":{"nodeSelector":null,"tolerations":null,"affinity":null}}}}' \
    >/dev/null 2>&1 || true
done

kubectl -n "$NS" apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: batch-runner
  namespace: $NS
spec:
  replicas: 2
  selector:
    matchLabels: {app: batch-runner}
  template:
    metadata:
      labels: {app: batch-runner}
    spec:
      nodeSelector:
        kubernetes.io/hostname: $PIN
      containers:
        - name: runner
          image: busybox:1.37
          command: ["sh", "-c"]
          args:
            - |
              while true; do
                echo "batch-runner: processing queue on \$(hostname)"
                sleep 30
              done
          resources:
            requests: {cpu: 10m, memory: 16Mi}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-frontend
  namespace: $NS
spec:
  replicas: 2
  selector:
    matchLabels: {app: web-frontend}
  template:
    metadata:
      labels: {app: web-frontend}
    spec:
      nodeSelector:
        kubernetes.io/hostname: $PIN
      containers:
        - name: web
          image: nginx:1.29-alpine
          ports:
            - name: http
              containerPort: 80
          resources:
            requests: {cpu: 10m, memory: 16Mi}
EOF

# Bounded, and failure is not fatal: the seed is correct the moment the objects
# exist, and every criterion reads the API rather than this wait. Waiting at all
# is for the candidate's sake — a question about moving Pods reads badly if the
# Pods have not been placed yet when they open it.
for dep in batch-runner web-frontend; do
  kubectl -n "$NS" rollout status "deploy/$dep" --timeout=60s >/dev/null 2>&1 || true
done
