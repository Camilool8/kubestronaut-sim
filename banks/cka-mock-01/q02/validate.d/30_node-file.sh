#!/usr/bin/env bash
# points: 1
# desc: /opt/course/2/node records the node fast-store is scheduled on
set -uo pipefail
actual=$(kubectl -n cka-sched get pod fast-store -o jsonpath='{.spec.nodeName}' 2>/dev/null)
[ -n "$actual" ] || { echo "pod not scheduled"; exit 1; }
grep -qx "$actual" /opt/course/2/node 2>/dev/null \
  && echo "node recorded" || { echo "wrong or missing /opt/course/2/node"; exit 1; }
