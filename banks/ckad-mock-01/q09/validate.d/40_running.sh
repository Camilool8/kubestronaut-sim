#!/usr/bin/env bash
# points: 2
# desc: a container named pulsar-agent is running from that image
set -uo pipefail
img=$(podman ps --filter name=^pulsar-agent$ --filter status=running \
  --format '{{.Image}}' 2>/dev/null | head -1)
[ -n "$img" ] || { echo "no running container named pulsar-agent"; exit 1; }
printf '%s' "$img" | grep -q 'pulsar-agent:v1' \
  && echo "running" \
  || { echo "pulsar-agent is running from '$img', want registry:5000/pulsar-agent:v1"; exit 1; }
