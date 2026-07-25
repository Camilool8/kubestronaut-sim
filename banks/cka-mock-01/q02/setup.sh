#!/usr/bin/env bash
set -euo pipefail
kubectl create ns cka-sched --dry-run=client -o yaml | kubectl apply -f -
# idempotent: a re-run (reset) must also remove any leftover label so the
# candidate genuinely performs step 1
kubectl label node sim-worker disk- --overwrite >/dev/null 2>&1 || true
