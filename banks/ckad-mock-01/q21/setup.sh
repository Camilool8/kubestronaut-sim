#!/usr/bin/env bash
set -euo pipefail
kubectl create ns pictor --dry-run=client -o yaml | kubectl apply -f -
