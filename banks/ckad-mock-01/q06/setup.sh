#!/usr/bin/env bash
set -euo pipefail
kubectl create ns atlas --dry-run=client -o yaml | kubectl apply -f -
