#!/usr/bin/env bash
set -euo pipefail

NS=pavo

kubectl create ns "$NS" --dry-run=client -o yaml | kubectl apply -f -

# Something for the pipeline identity to read and to scale. The candidate never
# edits it; it exists so the Role being written has real objects behind it and
# so `kubectl get pods` answers something once the grant works.
kubectl -n "$NS" create deployment pipeline-web \
  --image=nginx:1.29-alpine --replicas=2 \
  --dry-run=client -o yaml | kubectl apply -f -
