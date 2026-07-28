#!/usr/bin/env bash
# points: 1
# desc: namespace smoke exists
set -uo pipefail
kubectl get ns smoke >/dev/null 2>&1 \
  && echo "namespace ok" || { echo "namespace 'smoke' does not exist"; exit 1; }
