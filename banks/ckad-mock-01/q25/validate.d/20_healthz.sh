#!/usr/bin/env bash
# points: 2
# desc: the loopback health endpoint's response body was saved on the instance
set -uo pipefail
. /banks/_lib/checks.sh

# Read back from the cluster rather than carried here as a second copy of
# the string, which would drift the first time setup.sh is edited.
# Compared with the whitespace out: a trailing newline from `wget -O` and
# one from an editor are not a wrong answer.
want=$(kubectl -n perseus get cm ledger-api-page -o jsonpath='{.data.healthz}' 2>/dev/null)
got=$(cat /opt/course/25/healthz 2>/dev/null)
squash() { printf '%s' "$1" | tr -d '[:space:]'; }

[ -n "$(squash "$want")" ] && [ "$(squash "$got")" = "$(squash "$want")" ] \
  && { echo "health response recorded"; exit 0; }

echo "/opt/course/25/healthz contains '$(printf '%s' "$got" | tr '\n' ' ')', want '$(printf '%s' "$want" | tr '\n' ' ')'"
show_actual text "$(cat /opt/course/25/healthz 2>/dev/null)"
show_why "The endpoint listens on 127.0.0.1, so 'localhost' means something different depending on where the request is made from: from the instance it is the instance, and from another Pod it is that Pod. Only a container inside ledger-api's own network namespace — which every ephemeral container is, targeted or not — resolves it to the listener this question is about."
exit 1
