#!/usr/bin/env bash
# points: 1
# desc: the container's log output was saved to /opt/course/9/pulsar.log
set -uo pipefail
. /banks/_lib/checks.sh
# The agent prints its channel on startup, so a real capture from the
# rebuilt image says "stable". A log saved before the Dockerfile edit
# says "beta", which is the mistake this catches.
log=$(cat /opt/course/9/pulsar.log 2>/dev/null)
[ -n "$log" ] || {
  echo "/opt/course/9/pulsar.log is missing or empty"
  show_actual text "$(podman ps -a 2>/dev/null)"
  show_why "The container's stdout is what podman logs prints, and it has to be redirected to that path. An empty file usually means the container was never running when the capture was taken, or that the name given to podman logs was not the container's."
  exit 1
}
printf '%s' "$log" | grep -q 'release channel: stable' && echo "logs captured" || {
  echo "log does not show the stable channel: $(printf '%s' "$log" | head -1)"
  show_actual text "$(head -20 /opt/course/9/pulsar.log 2>/dev/null)"
  show_why "The agent prints its channel from the environment as it starts, so this output came from a container built before the Dockerfile edit. Rebuilding the image is not enough on its own: the running container keeps the layers it started with until it is removed and recreated."
  exit 1
}
