#!/usr/bin/env bash
set -euo pipefail
kubectl -n crater create serviceaccount report-reader \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n crater create role configmap-reader \
  --verb=get --verb=list --verb=watch --resource=configmaps \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n crater create rolebinding report-reader-binding \
  --role=configmap-reader --serviceaccount=crater:report-reader \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl delete clusterrolebinding report-reader-legacy --ignore-not-found
