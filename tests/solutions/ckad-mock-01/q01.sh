#!/usr/bin/env bash
set -euo pipefail
kubectl create ns aurora-staging --dry-run=client -o yaml | kubectl apply -f -
kubectl label ns aurora-staging team=aurora --overwrite

kubectl -n aurora-staging create quota staging-quota --hard=pods=5,requests.cpu=1000m \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl get ns -l team=aurora -o name | cut -d/ -f2 | sort \
  | sed -e '1s/$/   /' -e '2s/$/\r/' \
  > /opt/course/1/aurora-namespaces
