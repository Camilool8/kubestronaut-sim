#!/bin/sh
# Bank-aware wrapper: the Go binary is env-driven only; this extracts the
# bank's exam.yaml into JSON (yq) and points the facilitator at it. Also
# invoked directly via `docker compose exec facilitator /entrypoint.sh
# grade` since `compose exec` skips the image ENTRYPOINT.
set -eu
yq -o=json '.' "/banks/${BANK}/exam.yaml" > /tmp/exam.json
export EXAM_JSON=/tmp/exam.json
export BANK_DIR="/banks/${BANK}"
exec /facilitator "$@"
