#!/usr/bin/env bash
# points: 2
# desc: the image was pushed to registry:5000
set -uo pipefail
. /banks/_lib/checks.sh
tags=$(curl -fsS --max-time 10 http://registry:5000/v2/pulsar-agent/tags/list 2>/dev/null)
[ -n "$tags" ] || {
  echo "registry has no repository 'pulsar-agent'"
  show_actual text "$(curl -fsS --max-time 10 http://registry:5000/v2/_catalog 2>/dev/null)"
  show_why "Building tags an image in local storage; pushing is a separate step that copies it to the registry, and the repository only exists there once a push has succeeded. This registry speaks plain HTTP, so a push that was never told to skip TLS verification fails at the handshake rather than at the upload. Above is everything the registry does hold."
  exit 1
}
printf '%s' "$tags" | grep -q '"v1"' && echo "pushed" || {
  echo "registry has pulsar-agent but no v1 tag: $tags"
  show_actual text "$tags"
  show_why "The repository arrived but this tag did not, so the push went up under a different name. A registry stores one repository with many tags, and the tag is part of what the image is called — pushing latest does not make v1 exist."
  exit 1
}
