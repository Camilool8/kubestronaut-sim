#!/usr/bin/env bash
set -euo pipefail
# The candidate creates everything here; setup only provides the
# Namespace, so a wrong-namespace answer fails on the object rather than
# on a missing namespace.
kubectl create ns vega --dry-run=client -o yaml | kubectl apply -f -
