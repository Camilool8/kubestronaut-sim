#!/usr/bin/env bash
set -euo pipefail
kubectl create ns pavo --dry-run=client -o yaml | kubectl apply -f -
