#!/usr/bin/env bash
set -euo pipefail
# The base and the unfinished overlay are delivered to the instance by
# q13/files/; only the target Namespace is seeded here.
kubectl create ns pavo --dry-run=client -o yaml | kubectl apply -f -
