#!/usr/bin/env bash
# points: 4
# desc: the app reaches the backend through localhost, and only through it
# expected: none — the check execs a live request from inside the app
#           container and reads whatever comes back at that moment, an event
#           rather than a document the candidate authored; the message and
#           evidence pane already carry the actual response/log.
set -uo pipefail
. /banks/_lib/checks.sh
out=$(kubectl -n dorado exec checkout -c app -- \
  wget -qO- -T 5 http://localhost:8080 2>/dev/null)
printf '%s' "$out" | grep -q 'backend-ok' && echo "proxied through the ambassador" || {
  echo "app could not reach the backend via localhost:8080 (got: $(printf '%s' "$out" | tr '\n' ' ' | head -c 120))"
  show_actual text "$(kubectl -n dorado logs checkout -c ambassador --tail=20 2>/dev/null)"
  show_why "Containers in a Pod share a network namespace, which is why localhost reaches a listener belonging to another container with no Service and no DNS involved. Nothing answered, so either the proxy is not listening on that port — its configuration never arrived, and its log above says so — or it is listening and cannot resolve the backend Service."
  exit 1
}
