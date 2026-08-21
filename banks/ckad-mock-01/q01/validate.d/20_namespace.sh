#!/usr/bin/env bash
# points: 2
# desc: Namespace aurora-staging exists with label team=aurora
# expected: namespace.json json
set -uo pipefail
. /banks/_lib/checks.sh

snapshot() {
  kubectl get ns aurora-staging -o json 2>/dev/null | jq -S '{team: (.metadata.labels.team // null)}'
}

evidence() {
  show_pair json namespace.json
  show_why "$1"
}

exists=$(kubectl get ns aurora-staging -o jsonpath='{.metadata.name}' 2>/dev/null)
[ -n "$exists" ] || {
  echo "Namespace aurora-staging not found"
  show_actual text "$(kubectl get ns --show-labels 2>/dev/null)"
  show_why "Every part of this question is graded on a Namespace named aurora-staging, and the pane above lists what actually exists. A Namespace created under another name is invisible to every check here."
  exit 1
}

lbl=$(kubectl get ns aurora-staging -o jsonpath='{.metadata.labels.team}' 2>/dev/null)
[ "$lbl" = "aurora" ] && echo "namespace ok" || {
  echo "missing label team=aurora (has: '${lbl:-<none>}')"
  evidence "The label is not decoration — it is what puts this Namespace into the set the rest of the question queries by label, so one created without it is invisible to a lookup for team=aurora."
  exit 1
}
