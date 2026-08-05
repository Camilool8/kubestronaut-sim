#!/usr/bin/env bash
# points: 2
# desc: the bare Pod was replaced by the Deployment and then deleted
set -uo pipefail
. /banks/_lib/checks.sh

# The replacement is checked FIRST, and not as a courtesy to 10_deployment
# — which grades the Deployment on its own merits and is unaffected by
# this. It is what stops the check being vacuous.
#
# "There is no Pod called report-runner" is true of a cluster where this
# question was never set up at all, so on its own this scored 2 points on
# an untouched environment. That made it the one check in the bank a
# freshly reset cluster could earn anything from, which is exactly what
# the smoke suite's "a reset environment scores 0" assertion exists to
# catch, and it caught it.
#
# Reading it as grading rather than as a bug fix: deleting the only
# running copy of a workload with nothing standing in for it is not a
# partially correct answer to "replace this Pod with a Deployment". It is
# the one outcome worse than leaving the Pod alone.
[ -n "$(kubectl -n auriga get deploy report-runner -o jsonpath='{.metadata.name}' 2>/dev/null)" ] || {
  echo "there is no Deployment report-runner, so nothing has replaced the bare Pod"
  show_actual text "$(kubectl -n auriga get all 2>/dev/null)"
  show_why "This step is the last one for a reason: the bare Pod is the only copy of the workload until the Deployment's replicas are Running. Delete it first and there is an outage between the two; delete it INSTEAD and there is no workload at all."
  exit 1
}

# The Deployment's Pods are named report-runner-<replicaset>-<suffix>, so
# a Pod called exactly report-runner is the bare one and nothing else.
owner=$(kubectl -n auriga get pod report-runner \
  -o jsonpath='{.metadata.ownerReferences[*].kind}' 2>/dev/null)
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "the bare Pod is gone"
  exit 0
fi

echo "Pod report-runner is still there${owner:+ (owned by ${owner})}"
show_actual text "$(kubectl -n auriga get pods -o wide 2>/dev/null)"
show_why "Leaving it running means the old, unhardened, unowned copy is still serving alongside the three new ones — four Pods where the question asked for three, and the one that cannot be rolled back is the one still holding root. Nothing deletes it for you: a Deployment adopts existing Pods only when they carry its selector AND have no controller of their own, and even then it would not have hardened this one."
exit 1
