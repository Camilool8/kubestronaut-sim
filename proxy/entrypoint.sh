#!/bin/sh
set -eu
if [ -f /shared/bank ]; then
  BANK=$(cat /shared/bank)
fi
if [ -z "${ALLOWED_DOMAINS:-}" ] && [ -n "${BANK:-}" ] && [ -f "/banks/${BANK}/exam.yaml" ]; then
  ALLOWED_DOMAINS=$(yq -r '(.spec.environment.allowedDomains // []) | join(",")' "/banks/${BANK}/exam.yaml")
  export ALLOWED_DOMAINS
fi
exec /docs-proxy
