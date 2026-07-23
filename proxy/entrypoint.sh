#!/bin/sh
# Bank-aware wrapper: the Go binary is env-driven only; this extracts the
# bank's allowlist when ALLOWED_DOMAINS isn't set explicitly.
set -eu
if [ -z "${ALLOWED_DOMAINS:-}" ] && [ -n "${BANK:-}" ] && [ -f "/banks/${BANK}/exam.yaml" ]; then
  ALLOWED_DOMAINS=$(yq -r '(.spec.environment.allowedDomains // ["kubernetes.io","helm.sh"]) | join(",")' "/banks/${BANK}/exam.yaml")
  export ALLOWED_DOMAINS
fi
exec /docs-proxy
