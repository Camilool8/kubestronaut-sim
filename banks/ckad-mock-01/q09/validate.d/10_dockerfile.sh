#!/usr/bin/env bash
# points: 2
# desc: Dockerfile sets RELEASE_CHANNEL to stable
set -uo pipefail
# Both ENV forms are valid Dockerfile syntax and both are correct answers.
line=$(grep -iE '^[[:space:]]*ENV[[:space:]]+RELEASE_CHANNEL[[:space:]]*=?[[:space:]]*' \
  /opt/course/9/image/Dockerfile 2>/dev/null | tail -1)
[ -n "$line" ] || { echo "no ENV RELEASE_CHANNEL line in /opt/course/9/image/Dockerfile"; exit 1; }
value=$(printf '%s' "$line" | sed -E 's/^[[:space:]]*[Ee][Nn][Vv][[:space:]]+RELEASE_CHANNEL[[:space:]]*=?[[:space:]]*//' \
  | tr -d '"'"'" | tr -d '[:space:]')
[ "$value" = "stable" ] \
  && echo "RELEASE_CHANNEL=stable" \
  || { echo "RELEASE_CHANNEL is '$value', want 'stable'"; exit 1; }
