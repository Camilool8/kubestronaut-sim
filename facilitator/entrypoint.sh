#!/bin/sh
# Bank-aware wrapper: the Go binary is env-driven only; this extracts the
# bank's exam.yaml into JSON (yq) and points the facilitator at it. Also
# invoked directly via `docker compose exec facilitator /entrypoint.sh
# grade` since `compose exec` skips the image ENTRYPOINT.
set -eu
# Runtime bank file (written by k8s-env/conductor) wins over the
# compose-time env default, so a conductor-driven bank switch only needs
# to rewrite /shared/bank and restart this container.
if [ -f /shared/bank ]; then
  BANK=$(cat /shared/bank)
fi
yq -o=json '.' "/banks/${BANK}/exam.yaml" > /tmp/exam.json
export EXAM_JSON=/tmp/exam.json
export BANK_DIR="/banks/${BANK}"
export ACTIVE_BANK="${BANK}"
exec /facilitator "$@"
