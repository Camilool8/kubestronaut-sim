#!/bin/sh
set -eu
if [ -f /shared/bank ]; then
  BANK=$(cat /shared/bank)
fi

if [ -n "${BANK:-}" ] && [ -f "/banks/${BANK}/exam.yaml" ]; then
  yq -o=json '.' "/banks/${BANK}/exam.yaml" > /tmp/exam.json
  export EXAM_JSON=/tmp/exam.json
  export BANK_DIR="/banks/${BANK}"
  export ACTIVE_BANK="${BANK}"
elif [ -n "${BANK:-}" ]; then

  echo "facilitator: bank '${BANK}' has no /banks/${BANK}/exam.yaml; starting with no exam loaded" >&2
fi
exec /facilitator "$@"
