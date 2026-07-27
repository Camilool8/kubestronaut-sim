#!/usr/bin/env bash
# points: 3
# desc: the app reaches the backend through localhost, and only through it
set -uo pipefail
# From inside the app container, so this exercises the whole chain:
# containers in a Pod share a network namespace, which is why localhost
# reaches the ambassador at all, and the ambassador resolves the Service.
out=$(kubectl -n dorado exec checkout -c app -- \
  wget -qO- -T 5 http://localhost:8080 2>/dev/null)
printf '%s' "$out" | grep -q 'backend-ok' \
  && echo "proxied through the ambassador" \
  || { echo "app could not reach the backend via localhost:8080 (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))"; exit 1; }
