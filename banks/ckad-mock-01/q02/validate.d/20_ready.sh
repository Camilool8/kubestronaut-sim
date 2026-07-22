#!/usr/bin/env bash
# points: 2
# desc: 3/3 replicas ready
set -uo pipefail
ready=$(kubectl -n nova get deploy nova-api -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[ "$ready" = "3" ] && echo "3 ready" || { echo "readyReplicas='$ready'"; exit 1; }
