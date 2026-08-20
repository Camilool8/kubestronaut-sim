#!/usr/bin/env bash
set -euo pipefail

NS=reticulum

kubectl create ns "$NS" --dry-run=client -o yaml | kubectl apply -f -

# The two classes the candidate has to outrank. Both are deliberately modest
# numbers and both are preemptionPolicy: Never, which is what makes seeding a
# ranked workload here safe: a PriorityClass is cluster-scoped and preemption is
# cluster-wide, so a high-valued preempting class on a Pod that cannot fit would
# evict Pods belonging to whatever other questions were drawn alongside this
# one. Nothing here can do that — the values stay far below
# system-cluster-critical (2000000000), neither class is globalDefault, and the
# only workload wearing one is two Pods with no resource requests at all, which
# the scheduler can always place.
#
# The VALUES are not written in question.md on purpose: reading them back with
# `kubectl get priorityclass` is half the task, and the grader reads them from
# the API too, so retuning them here does not silently invalidate a check.
ensure_pc() { # name, value, description
  local name=$1 value=$2 desc=$3 cur pol

  # value is immutable on a PriorityClass — the API rejects an update that
  # changes it — so an apply over a class left behind under the same name with a
  # different number would abort this whole script on a reseed. preemptionPolicy
  # is grouped with it because a delete-and-recreate is correct whether or not
  # the API accepts an in-place update to that field. Deleting a class
  # does not touch the Pods already admitted with it: their spec.priority was
  # resolved at admission and stays.
  cur=$(kubectl get priorityclass "$name" -o jsonpath='{.value}' 2>/dev/null || true)
  pol=$(kubectl get priorityclass "$name" -o jsonpath='{.preemptionPolicy}' 2>/dev/null || true)
  if [ -n "$cur" ] && { [ "$cur" != "$value" ] || [ "$pol" != Never ]; }; then
    kubectl delete priorityclass "$name" --ignore-not-found
  fi

  kubectl apply -f - <<EOF
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: ${name}
value: ${value}
globalDefault: false
preemptionPolicy: Never
description: "${desc}"
EOF
}

ensure_pc q22-bulk 10000 "Background and batch work in reticulum. Scheduled last, never preempts."
ensure_pc q22-standard 250000 "Ordinary request-serving workloads in reticulum. Never preempts."

# The seed's rolling update strategy is written out in full and set to values
# the question does NOT ask for. Leaving the block out would have the API fill
# in 25%/25%, and either way an untouched Deployment must not already satisfy a
# criterion: a freshly prepared environment has to score zero.
#
# priorityClassName is seeded as q22-standard rather than left empty for the
# same reason it is realistic — this question promotes a workload that is
# already ranked, so the Pods start out carrying a resolved spec.priority of
# 250000 and the graded one is a different number.
#
# No resource requests, two replicas, a preloaded image: this workload is
# schedulable on any node this cluster still has, which is what keeps a
# candidate's high-valued class from having anything to preempt even if they
# write one that preempts.
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  namespace: ${NS}
  labels: {app: checkout-api}
spec:
  replicas: 2
  selector:
    matchLabels: {app: checkout-api}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
  template:
    metadata:
      labels: {app: checkout-api}
    spec:
      priorityClassName: q22-standard
      containers:
        - name: api
          image: nginx:1.29-alpine
          ports:
            - name: http
              containerPort: 80
EOF

kubectl -n "$NS" rollout status deploy/checkout-api --timeout=180s

# The class the candidate creates is theirs to create, so one left over from an
# earlier attempt would be a criterion already met on the next. This runs on a
# cluster CREATE and on a training reseed, never on a resume (bootstrap.sh skips
# the seed branch when the cluster was resumed), so it cannot delete work
# mid-attempt. It comes AFTER the Deployment is reset: with the template already
# pointed back at q22-standard, no ReplicaSet is left referencing a name that
# has just stopped existing.
kubectl delete priorityclass q22-critical --ignore-not-found
