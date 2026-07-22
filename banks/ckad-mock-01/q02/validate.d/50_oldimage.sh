#!/usr/bin/env bash
# points: 1
# desc: /opt/course/2/old-image contains the broken image name
set -uo pipefail
grep -qx 'nginx:1.99' /opt/course/2/old-image 2>/dev/null \
  && echo "old image recorded" || { echo "wrong or missing /opt/course/2/old-image"; exit 1; }
