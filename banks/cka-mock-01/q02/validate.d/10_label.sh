#!/usr/bin/env bash
# points: 1
# desc: node sim-worker carries label disk=ssd
set -uo pipefail
val=$(kubectl get node sim-worker -o jsonpath='{.metadata.labels.disk}' 2>/dev/null)
[ "$val" = "ssd" ] && echo "label ok" || { echo "label missing (got: '$val')"; exit 1; }
