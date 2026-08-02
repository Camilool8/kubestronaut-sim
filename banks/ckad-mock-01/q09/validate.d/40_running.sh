#!/usr/bin/env bash
# points: 1
# desc: a container named pulsar-agent is running from that image
set -uo pipefail
. /banks/_lib/checks.sh
img=$(podman ps --filter name=^pulsar-agent$ --filter status=running \
  --format '{{.Image}}' 2>/dev/null | head -1)
[ -n "$img" ] || {
  echo "no running container named pulsar-agent"
  show_actual text "$(podman ps -a 2>/dev/null)"
  show_why "Detaching is what leaves the container running after the command returns; without it podman stays attached and the container ends when you do. A container that started and exited still appears above with its exit status, and one built from an image whose command finishes immediately will always look like that."
  exit 1
}
printf '%s' "$img" | grep -q 'pulsar-agent:v1' && echo "running" || {
  echo "pulsar-agent is running from '$img', want registry:5000/pulsar-agent:v1"
  show_actual text "$(podman ps -a 2>/dev/null)"
  show_why "The container is running from a different image. podman never rebuilds or re-pulls for a name it already has locally, so a container started before the rebuild keeps the old layers no matter how many times the image is rebuilt around it — it has to be removed and recreated."
  exit 1
}
