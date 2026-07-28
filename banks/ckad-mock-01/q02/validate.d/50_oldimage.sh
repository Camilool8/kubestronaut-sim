#!/usr/bin/env bash
# points: 1
# desc: /opt/course/2/old-image contains the broken image name
set -uo pipefail
. /banks/_lib/checks.sh
# Was `grep -qx 'nginx:1.99'`, which failed on a trailing space or a CRLF
# from an editor. Neither is a wrong answer to "record the old image
# name", and the message did not say which had happened.
got=$(file_text /opt/course/2/old-image)
[ "$got" = "nginx:1.99" ] \
  && echo "old image recorded" \
  || { echo "/opt/course/2/old-image is '$got', want 'nginx:1.99'"; exit 1; }
