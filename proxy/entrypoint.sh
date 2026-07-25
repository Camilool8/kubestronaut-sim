#!/bin/sh
# Bank-aware wrapper: the Go binary is env-driven only; this extracts the
# bank's allowlist when ALLOWED_DOMAINS isn't set explicitly.
set -eu
# Runtime bank file wins over the compose-time env default (see
# k8s-env/bootstrap.sh). Falls back to $BANK so this service never
# blocks on first boot ordering.
if [ -f /shared/bank ]; then
  BANK=$(cat /shared/bank)
fi
# A bank that declares no allowedDomains falls through to the binary's
# own default (allow.DefaultDomains) rather than a copy maintained here.
if [ -z "${ALLOWED_DOMAINS:-}" ] && [ -n "${BANK:-}" ] && [ -f "/banks/${BANK}/exam.yaml" ]; then
  ALLOWED_DOMAINS=$(yq -r '(.spec.environment.allowedDomains // []) | join(",")' "/banks/${BANK}/exam.yaml")
  export ALLOWED_DOMAINS
fi
exec /docs-proxy
