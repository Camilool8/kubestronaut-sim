#!/usr/bin/env bash
set -euo pipefail
dockerd-entrypoint.sh &
until docker info >/dev/null 2>&1; do sleep 1; done
echo "inner dockerd up"
/opt/sim/bootstrap.sh
echo "k8s-env ready"
tail -f /dev/null
