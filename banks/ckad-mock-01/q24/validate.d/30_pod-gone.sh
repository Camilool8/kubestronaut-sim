#!/usr/bin/env bash
# points: 2
# desc: the bare Pod was replaced by the Deployment and then deleted
set -uo pipefail
. /banks/_lib/checks.sh

[ -n "$(kubectl -n auriga get deploy report-runner -o jsonpath='{.metadata.name}' 2>/dev/null)" ] || {
  echo "there is no Deployment report-runner, so nothing has replaced the bare Pod"
  show_actual text "$(kubectl -n auriga get all 2>/dev/null)"
  show_why "This step is the last one for a reason: the bare Pod is the only copy of the workload until the Deployment's replicas are Running. Delete it first and there is an outage between the two; delete it INSTEAD and there is no workload at all."
  exit 1
}

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
