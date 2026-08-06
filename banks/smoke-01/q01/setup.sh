#!/usr/bin/env bash
set -euo pipefail
kubectl delete ns smoke --ignore-not-found --wait=false >/dev/null 2>&1 || true
