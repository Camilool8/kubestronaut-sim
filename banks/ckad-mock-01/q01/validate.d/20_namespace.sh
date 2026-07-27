#!/usr/bin/env bash
# points: 2
# desc: Namespace aurora-staging exists with label team=aurora
set -uo pipefail
lbl=$(kubectl get ns aurora-staging -o jsonpath='{.metadata.labels.team}' 2>/dev/null)
[ "$lbl" = "aurora" ] && echo "namespace ok" || { echo "missing ns or label"; exit 1; }
