#!/usr/bin/env bash
# points: 3
# desc: a valid pipeline-runner token, good for at least an hour, was saved
set -uo pipefail
tok=$(cat /opt/course/15/pipeline-token 2>/dev/null | tr -d '[:space:]')
[ -n "$tok" ] || { echo "/opt/course/15/pipeline-token is missing or empty"; exit 1; }
[ "$(printf '%s' "$tok" | awk -F. '{print NF}')" = "3" ] \
  || { echo "that does not look like a JWT (expected three dot-separated parts)"; exit 1; }

# Decode the claims rather than trusting the file: base64url differs from
# base64 in two characters and carries no padding.
payload=$(printf '%s' "$tok" | cut -d. -f2)
pad=$(( (4 - ${#payload} % 4) % 4 ))
[ "$pad" -gt 0 ] && payload="${payload}$(printf '=%.0s' $(seq 1 "$pad"))"
claims=$(printf '%s' "$payload" | tr '_-' '/+' | base64 -d 2>/dev/null)
[ -n "$claims" ] || { echo "could not decode the token's claims"; exit 1; }

printf '%s' "$claims" | grep -q 'system:serviceaccount:phoenix:pipeline-runner' \
  || { echo "the token is not for phoenix/pipeline-runner"; exit 1; }

# iat/exp are seconds since the epoch; an hour is 3600.
iat=$(printf '%s' "$claims" | jq -r '.iat // 0')
exp=$(printf '%s' "$claims" | jq -r '.exp // 0')
life=$((exp - iat))
[ "$life" -ge 3600 ] \
  && echo "token valid for ${life}s" \
  || { echo "token lifetime is ${life}s, want at least 3600 (--duration=1h)"; exit 1; }
