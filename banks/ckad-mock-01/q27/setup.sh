#!/usr/bin/env bash
set -euo pipefail
kubectl create ns fornax --dry-run=client -o yaml | kubectl apply -f -
