#!/usr/bin/env bash
# points: 2
# desc: the image was pushed to registry:5000
set -uo pipefail
tags=$(curl -fsS --max-time 10 http://registry:5000/v2/pulsar-agent/tags/list 2>/dev/null)
[ -n "$tags" ] || { echo "registry has no repository 'pulsar-agent'"; exit 1; }
printf '%s' "$tags" | grep -q '"v1"' \
  && echo "pushed" \
  || { echo "registry has pulsar-agent but no v1 tag: $tags"; exit 1; }
