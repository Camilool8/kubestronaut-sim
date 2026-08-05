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

# No exam chosen yet is a normal state, not a failure.
#
# This used to interpolate $BANK unconditionally under `set -eu`, so an
# unset one killed the wrapper before the binary ever ran — and with
# `restart: unless-stopped` on the service, that is an invisible restart
# loop with nothing on :8080. It has to survive it now: the exam selector
# this facilitator serves is exactly where the candidate goes to choose
# the bank, so refusing to start until one exists cannot work.
#
# The three variables are left empty and the binary decides what to do
# with that (facilitator/cmd/facilitator/main.go).
if [ -n "${BANK:-}" ] && [ -f "/banks/${BANK}/exam.yaml" ]; then
  yq -o=json '.' "/banks/${BANK}/exam.yaml" > /tmp/exam.json
  export EXAM_JSON=/tmp/exam.json
  export BANK_DIR="/banks/${BANK}"
  export ACTIVE_BANK="${BANK}"
elif [ -n "${BANK:-}" ]; then
  # Named a bank that is not there. Distinct from choosing none, and
  # worth saying out loud: it is a typo or a bad mount, not a state the
  # product has.
  echo "facilitator: bank '${BANK}' has no /banks/${BANK}/exam.yaml; starting with no exam loaded" >&2
fi
exec /facilitator "$@"
