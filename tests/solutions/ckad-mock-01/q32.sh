#!/usr/bin/env bash
set -euo pipefail
kubectl -n sagitta rollout restart deploy/session-store
kubectl -n sagitta rollout status deploy/session-store --timeout=180s
