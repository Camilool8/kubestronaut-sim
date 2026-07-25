#!/usr/bin/env bash
set -euo pipefail
kubectl create ns cka-rbac --dry-run=client -o yaml | kubectl apply -f -
