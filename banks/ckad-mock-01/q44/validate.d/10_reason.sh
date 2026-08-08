#!/usr/bin/env bash
# points: 2
# desc: the reason the original Job reported for giving up was recorded
set -uo pipefail
. /banks/_lib/checks.sh

got=$(file_text /opt/course/44/reason)
lower=$(printf '%s' "$got" | tr '[:upper:]' '[:lower:]')
[ "$lower" = "backofflimitexceeded" ] && { echo "reason recorded"; exit 0; }

echo "/opt/course/44/reason contains '$got', want BackoffLimitExceeded"
show_actual text "$(cat /opt/course/44/reason 2>/dev/null)"
show_why "A finished Job records how it finished as a condition on its status, and the condition carries a short machine-readable reason beside the human sentence. BackoffLimitExceeded means the Job ran out of tolerated failures; DeadlineExceeded would mean activeDeadlineSeconds expired first, and the two are different problems with different fixes. The file wants that single word — not the condition type, not the message, and not the whole block."
exit 1
