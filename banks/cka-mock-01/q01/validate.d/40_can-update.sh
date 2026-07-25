#!/usr/bin/env bash
# points: 1
# desc: /opt/course/1/can-update records the successful can-i check
set -uo pipefail
grep -qx 'yes' /opt/course/1/can-update 2>/dev/null \
  || { echo "wrong or missing /opt/course/1/can-update"; exit 1; }
live=$(kubectl auth can-i update deployments -n cka-rbac \
  --as=system:serviceaccount:cka-rbac:deploy-bot 2>/dev/null)
[ "$live" = "yes" ] && echo "can-i verified" \
  || { echo "live can-i check returned '$live'"; exit 1; }
