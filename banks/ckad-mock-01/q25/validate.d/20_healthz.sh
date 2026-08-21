#!/usr/bin/env bash
# points: 2
# desc: the loopback health endpoint's response body was saved on the instance
# expected: healthz.txt text
set -uo pipefail
. /banks/_lib/checks.sh

want=$(kubectl -n perseus get cm ledger-api-page -o jsonpath='{.data.healthz}' 2>/dev/null)
got=$(cat /opt/course/25/healthz 2>/dev/null)
squash() { printf '%s' "$1" | tr -d '[:space:]'; }

snapshot() {
  cat /opt/course/25/healthz 2>/dev/null
}

evidence() {
  show_pair text healthz.txt
  show_why "$1"
}

[ -n "$(squash "$want")" ] && [ "$(squash "$got")" = "$(squash "$want")" ] \
  && { echo "health response recorded"; exit 0; }

echo "/opt/course/25/healthz contains '$(printf '%s' "$got" | tr '\n' ' ')', want '$(printf '%s' "$want" | tr '\n' ' ')'"
evidence "The endpoint listens on 127.0.0.1, so 'localhost' means something different depending on where the request is made from: from the instance it is the instance, and from another Pod it is that Pod. Only a container inside ledger-api's own network namespace — which every ephemeral container is, targeted or not — resolves it to the listener this question is about."
exit 1
