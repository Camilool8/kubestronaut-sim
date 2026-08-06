#!/usr/bin/env bash
set -euo pipefail
kubectl create ns vega --dry-run=client -o yaml | kubectl apply -f -
