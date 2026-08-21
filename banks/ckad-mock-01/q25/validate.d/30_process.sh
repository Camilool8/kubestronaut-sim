#!/usr/bin/env bash
# points: 2
# desc: the api container's main process was recorded from the shared process namespace
# expected: none — the recorded file is a `ps`-style process listing, and
#           every field but the one substring this check greps for (a PID, a
#           start time) is different on every run; an authored copy would
#           only teach the candidate to look for numbers that were never
#           going to be theirs, the same reason an EndpointSlice never gets
#           one (docs/bank-spec.md).
set -uo pipefail
. /banks/_lib/checks.sh

got=$(cat /opt/course/25/api-process 2>/dev/null)
case "$got" in
  *"master process"*) echo "process recorded"; exit 0 ;;
esac

echo "/opt/course/25/api-process does not name the api container's main process"
show_actual text "$got"
show_why "nginx rewrites its own argv, so its main process reports itself as 'nginx: master process ...'. That string is visible from the debugging container only when the two share a process namespace: with no --target, 'ps' inside an ephemeral container lists that container's own processes and nothing else, and /proc holds only its own PIDs."
exit 1
