#!/usr/bin/env bash
set -euo pipefail
kubectl -n cka-rbac create sa deploy-bot --dry-run=client -o yaml | kubectl apply -f -
kubectl -n cka-rbac create role deployment-manager \
  --verb=get,list,watch,create,update,patch --resource=deployments.apps \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n cka-rbac create rolebinding deploy-bot-binding \
  --role=deployment-manager --serviceaccount=cka-rbac:deploy-bot \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl auth can-i update deployments -n cka-rbac \
  --as=system:serviceaccount:cka-rbac:deploy-bot > /opt/course/1/can-update
