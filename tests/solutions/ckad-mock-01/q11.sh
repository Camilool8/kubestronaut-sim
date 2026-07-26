#!/usr/bin/env bash
set -euo pipefail
helm -n carina uninstall report-api-v1
helm -n carina upgrade report-api-v2 sim/sim-web --version 1.1.0 --wait --timeout 3m
helm -n carina upgrade --install report-cache sim/sim-cache --set replicaCount=2 --wait --timeout 3m
helm -n carina uninstall report-legacy
