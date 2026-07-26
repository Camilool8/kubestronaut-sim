#!/usr/bin/env bash
set -euo pipefail
kubectl create ns cygnus --dry-run=client -o yaml | kubectl apply -f -
