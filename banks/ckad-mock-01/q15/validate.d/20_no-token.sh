#!/usr/bin/env bash
# points: 3
# desc: Pod no-token gets no ServiceAccount token mounted at all
set -uo pipefail
auto=$(kubectl -n phoenix get pod no-token \
  -o jsonpath='{.spec.automountServiceAccountToken}' 2>/dev/null)
[ "$auto" = "false" ] || { echo "automountServiceAccountToken is '$auto', want false"; exit 1; }

# The declaration and the result are different things — the same field on
# the ServiceAccount, or a projected volume added by hand, can change what
# actually lands in the container. Prove the directory really is absent.
if kubectl -n phoenix exec no-token -c web -- \
     test -e /var/run/secrets/kubernetes.io/serviceaccount 2>/dev/null; then
  echo "a token is still mounted inside the container"
  exit 1
fi
phase=$(kubectl -n phoenix get pod no-token -o jsonpath='{.status.phase}' 2>/dev/null)
[ "$phase" = "Running" ] \
  && echo "no token mounted" \
  || { echo "pod phase is '$phase', want Running"; exit 1; }
