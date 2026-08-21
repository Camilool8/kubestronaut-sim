#!/usr/bin/env bash
# points: 3
# desc: a valid pipeline-runner token, good for at least an hour, was saved
# expected: none — the check grades a ServiceAccount token requested live from
#           the API server: its claims carry the moment it was issued
#           (iat/exp), so a document captured once would never match a token
#           requested at a different time. The decoded claims pane already
#           shows what was actually issued.
set -uo pipefail
. /banks/_lib/checks.sh
tok=$(cat /opt/course/15/pipeline-token 2>/dev/null | tr -d '[:space:]')
[ -n "$tok" ] || {
  echo "/opt/course/15/pipeline-token is missing or empty"
  show_why "Nothing was written to that path. Requesting a token prints it to stdout and nowhere else, so it has to be redirected — and the token is issued on demand rather than stored anywhere in the cluster, so there is no object to go back and read it from afterwards."
  exit 1
}
[ "$(printf '%s' "$tok" | awk -F. '{print NF}')" = "3" ] || {
  echo "that does not look like a JWT (expected three dot-separated parts)"
  show_why "A ServiceAccount token is a JWT: three base64url segments separated by dots, being the header, the claims and the signature. What is in the file is something else — since Kubernetes 1.24 a ServiceAccount no longer comes with a Secret holding a token, so looking for one with kubectl get secret and saving what turns up is the usual way to end up here."
  exit 1
}

payload=$(printf '%s' "$tok" | cut -d. -f2)
pad=$(( (4 - ${#payload} % 4) % 4 ))
[ "$pad" -gt 0 ] && payload="${payload}$(printf '=%.0s' $(seq 1 "$pad"))"
claims=$(printf '%s' "$payload" | tr '_-' '/+' | base64 -d 2>/dev/null)
[ -n "$claims" ] || {
  echo "could not decode the token's claims"
  show_why "The three segments are there but the middle one is not decodable as base64url — which differs from ordinary base64 in two of its characters and carries no padding. A token mangled by line wrapping or by an editor does this."
  exit 1
}

iat=$(printf '%s' "$claims" | jq -r '.iat // 0')
exp=$(printf '%s' "$claims" | jq -r '.exp // 0')
life=$((exp - iat))

right_identity() { printf '%s' "$claims" | grep -q 'system:serviceaccount:phoenix:pipeline-runner'; }
long_enough()    { [ "$life" -ge 3600 ]; }

crit 2 "issued for phoenix/pipeline-runner" \
  "the token is not for phoenix/pipeline-runner" \
  "The sub claim names the identity the token was issued for, spelled system:serviceaccount:<namespace>:<name>. This one names something else — usually the Namespace's default account, which is what you get when the request does not name one." \
  -- right_identity

crit 1 "valid for at least an hour" \
  "token lifetime is ${life}s, want at least 3600 (--duration=1h)" \
  "A modern ServiceAccount token is short-lived on purpose and its lifetime is decided when it is REQUESTED — exp minus iat, both seconds since the epoch. Ask for no duration and you get the cluster's default, which is an hour on many clusters and is not something to bet on when the question names a figure." \
  -- long_enough

crit_all_passed || {
  show_actual json "$claims"
  show_why "$(crit_why)"
}
report "token valid for ${life}s"
