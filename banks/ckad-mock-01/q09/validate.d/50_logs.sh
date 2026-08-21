#!/usr/bin/env bash
# points: 1
# desc: the container's log output was saved to /opt/course/9/pulsar.log
# expected: none — the check grades whether the container's actual runtime
#           stdout, once redirected to a file, shows the correct behavior. The
#           file's content is a captured measurement of what the running
#           process printed, not text the candidate composed, so it has no
#           document to pair against; the pane above already shows what was
#           captured.
set -uo pipefail
. /banks/_lib/checks.sh
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
