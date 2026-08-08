#!/usr/bin/env bash
# points: 2
# desc: the dead container's own log message was captured
set -uo pipefail
. /banks/_lib/checks.sh
grep -q 'FATAL: cache directory /var/cache/corvus is unavailable' /opt/course/17/crash.log 2>/dev/null && echo "crash log captured" || {
  echo "/opt/course/17/crash.log does not contain the container's failure message"
  show_actual text "$(head -20 /opt/course/17/crash.log 2>/dev/null)"
  show_why "The container that failed has already exited and been replaced, so reading the logs plainly shows the CURRENT attempt — often empty, because the new container is still in backoff and has not printed anything yet. Asking for the previous container's logs is what reaches the run that died. If what was saved says the logs could not be retrieved, that container has since been garbage-collected: that message goes to stdout with a zero exit, so a redirect captures it as though it were the log."
  exit 1
}
