#!/usr/bin/env bash
set -euo pipefail
kubectl create ns phoenix --dry-run=client -o yaml | kubectl apply -f -
