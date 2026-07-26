#!/usr/bin/env bash
set -euo pipefail
HELM_REPO_PORT=${HELM_REPO_PORT:-8879}
rm -f /shared/ready   # clear stale marker before healthcheck can see it
dockerd-entrypoint.sh &
until docker info >/dev/null 2>&1; do sleep 1; done
echo "inner dockerd up"

# The local chart repository is built and served BEFORE bootstrap runs,
# because bootstrap seeds the questions and a Helm question's setup.sh
# installs releases from this repo. Packaging here rather than in
# bootstrap also means the httpd is started exactly once: bootstrap
# re-runs on every reset and bank switch while this container keeps
# running, and a second httpd would just fail to bind.
mkdir -p /shared/helm-repo
if [ -d /banks/_charts ]; then
  echo "packaging local Helm charts..."
  rm -rf /shared/helm-repo
  mkdir -p /shared/helm-repo
  for chart in /banks/_charts/*/; do
    [ -f "${chart}Chart.yaml" ] || continue
    helm package "$chart" -d /shared/helm-repo >/dev/null
  done
  helm repo index /shared/helm-repo --url "http://k8s-env:${HELM_REPO_PORT}"
fi
httpd -p "${HELM_REPO_PORT}" -h /shared/helm-repo
echo "helm repo on :${HELM_REPO_PORT}"
# Reachable by name from here too, so a question's setup.sh can install
# from the repo exactly as a candidate would.
helm repo add sim "http://k8s-env:${HELM_REPO_PORT}" --force-update >/dev/null 2>&1 || true
helm repo update >/dev/null 2>&1 || true

/opt/sim/bootstrap.sh

echo "k8s-env ready"
tail -f /dev/null
