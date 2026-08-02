#!/usr/bin/env bash
# points: 1
# desc: /opt/course/2/old-image contains the broken image name
set -uo pipefail
. /banks/_lib/checks.sh
# Was `grep -qx 'nginx:1.99'`, which failed on a trailing space or a CRLF
# from an editor. Neither is a wrong answer to "record the old image
# name", and the message did not say which had happened.
got=$(file_text /opt/course/2/old-image)
[ "$got" = "nginx:1.99" ] && echo "old image recorded" || {
  echo "/opt/course/2/old-image is '$got', want 'nginx:1.99'"
  show_actual text "$(cat /opt/course/2/old-image 2>/dev/null)"
  show_why "This part has to happen BEFORE the Deployment is repaired: it records the broken image as you found it. Once the Pod template has been edited the old tag survives only in the rollout history, and an empty file means it was never captured at all."
  exit 1
}
