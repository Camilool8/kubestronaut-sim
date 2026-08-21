#!/usr/bin/env bash
# points: 1
# desc: Dockerfile sets RELEASE_CHANNEL to stable
# expected: release-channel.txt text
set -uo pipefail
. /banks/_lib/checks.sh

line=$(grep -iE '^[[:space:]]*ENV[[:space:]]+RELEASE_CHANNEL[[:space:]]*=?[[:space:]]*' \
  /opt/course/9/image/Dockerfile 2>/dev/null | tail -1)
[ -n "$line" ] || {
  echo "no ENV RELEASE_CHANNEL line in /opt/course/9/image/Dockerfile"
  show_actual text "$(cat /opt/course/9/image/Dockerfile 2>/dev/null)"
  show_why "ENV bakes a value into the image at build time, so every container started from it carries the variable without anyone passing it. There is no ENV RELEASE_CHANNEL line in the file at all — the task is to change the value on the line that was there, not to remove it."
  exit 1
}
value=$(printf '%s' "$line" | sed -E 's/^[[:space:]]*[Ee][Nn][Vv][[:space:]]+RELEASE_CHANNEL[[:space:]]*=?[[:space:]]*//' \
  | tr -d '"'"'" | tr -d '[:space:]')

snapshot() {
  printf '%s' "${value:-}"
}

evidence() {
  show_pair text release-channel.txt
  show_why "$1"
}

[ "$value" = "stable" ] && echo "RELEASE_CHANNEL=stable" || {
  echo "RELEASE_CHANNEL is '$value', want 'stable'"
  evidence "The Dockerfile is only the first half of this task: ENV decides what gets baked in, and the image has to be built again afterwards for the new value to exist anywhere. Both ENV KEY=value and ENV KEY value are accepted."
  exit 1
}
