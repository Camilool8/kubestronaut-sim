#!/usr/bin/env bash
# points: 1
# desc: the failing container's own output was captured before the Job was removed
# expected: failure-log.txt text
set -uo pipefail
. /banks/_lib/checks.sh

# The container's own command prints one fixed sentence and nothing that
# varies between runs — no timestamp, no Pod IP, no random data — so unlike a
# log capture whose content changes on every run, a correctly solved capture
# of this Job's failed Pods is byte-for-byte the same every time.
snapshot() {
  cat /opt/course/44/failure.log 2>/dev/null
}

grep -q 'ledger checksum mismatch' /opt/course/44/failure.log 2>/dev/null \
  && { echo "failure log captured"; exit 0; }

echo "/opt/course/44/failure.log does not contain the container's failure message"
show_pair text failure-log.txt
show_why "The Job's Pods were left behind in a terminal phase rather than deleted, so their logs were still readable — a Job with restartPolicy Never creates a fresh Pod per attempt and keeps every one of them. A label selector reads all of them at once, and with a selector kubectl prints only the last ten lines per Pod unless asked for more. Once the Job is deleted its Pods go with it, which is why this had to be saved before the rewrite."
exit 1
