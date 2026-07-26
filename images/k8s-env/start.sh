#!/usr/bin/env bash
set -euo pipefail
HELM_REPO_PORT=${HELM_REPO_PORT:-8879}
export HELM_REPO_PORT
rm -f /shared/ready   # clear stale marker before healthcheck can see it
dockerd-entrypoint.sh &
until docker info >/dev/null 2>&1; do sleep 1; done
echo "inner dockerd up"
/opt/sim/bootstrap.sh

# Serve the packaged Helm charts. Started here rather than in bootstrap.sh
# because bootstrap re-runs on every reset and bank switch while this
# container keeps running: a second httpd would just fail to bind. It
# serves a directory, so a rebuilt repo is picked up with no restart.
mkdir -p /shared/helm-repo
httpd -p "${HELM_REPO_PORT}" -h /shared/helm-repo
echo "helm repo on :${HELM_REPO_PORT}"

echo "k8s-env ready"
tail -f /dev/null
