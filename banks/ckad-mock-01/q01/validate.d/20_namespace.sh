#!/usr/bin/env bash
# points: 2
# desc: Namespace aurora-staging exists with label team=aurora
set -uo pipefail
. /banks/_lib/checks.sh
lbl=$(kubectl get ns aurora-staging -o jsonpath='{.metadata.labels.team}' 2>/dev/null)
[ "$lbl" = "aurora" ] && echo "namespace ok" || {
  echo "missing ns or label"
  show_actual yaml "$(kubectl get ns aurora-staging -o yaml 2>/dev/null | k8s_clean)"
  show_why "Two things are asked for here and both are graded: the Namespace exists, and it carries the label team=aurora. The label is not decoration — it is what puts this Namespace into the set the rest of the question queries, so one created without it is invisible to a lookup by label. An empty pane means the Namespace does not exist at all."
  exit 1
}
