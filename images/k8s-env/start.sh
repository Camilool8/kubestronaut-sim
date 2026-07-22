#!/usr/bin/env bash
set -euo pipefail
rm -f /shared/ready   # clear stale marker before healthcheck can see it
dockerd-entrypoint.sh &
until docker info >/dev/null 2>&1; do sleep 1; done
echo "inner dockerd up"
/opt/sim/bootstrap.sh
echo "k8s-env ready"
tail -f /dev/null
