#!/usr/bin/env bash
set -euo pipefail
kubectl create ns orion --dry-run=client -o yaml | kubectl apply -f -
