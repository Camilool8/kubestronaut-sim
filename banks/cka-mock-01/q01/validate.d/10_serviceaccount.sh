#!/usr/bin/env bash
# points: 1
# desc: ServiceAccount deploy-bot exists in cka-rbac
set -uo pipefail
kubectl -n cka-rbac get sa deploy-bot >/dev/null 2>&1 \
  && echo "serviceaccount ok" || { echo "serviceaccount missing"; exit 1; }
