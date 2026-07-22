#!/usr/bin/env bash
set -euo pipefail
for ns in aurora-web aurora-data; do
  kubectl create ns "$ns" --dry-run=client -o yaml | kubectl apply -f -
  kubectl label ns "$ns" team=aurora --overwrite
done
kubectl create ns borealis-api --dry-run=client -o yaml | kubectl apply -f -
kubectl label ns borealis-api team=borealis --overwrite
