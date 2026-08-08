#!/usr/bin/env bash
# points: 2
# desc: the scheduler's own message about the Pod was captured verbatim
set -uo pipefail
. /banks/_lib/checks.sh

# Match one stable fragment rather than the whole sentence. The scheduler
# rewords the surrounding text between releases — how the node tally is
# phrased, whether preemption is mentioned — but the predicate that rejected
# the node is always named this way.
grep -qi 'insufficient memory' /opt/course/41/reason 2>/dev/null && { echo "reason recorded"; exit 0; }

echo "/opt/course/41/reason does not carry the scheduler's message"
show_actual text "$(head -20 /opt/course/41/reason 2>/dev/null)"
show_why "A Pod with no container has no log to read, so the reason lives in its events, written by default-scheduler with reason FailedScheduling. The message names the predicate that rejected each node, and here that is memory: the Pod asks for more than any node has left. Describing the Pod shows the same event at the bottom of the output. A file holding a paraphrase, or the Pod's own spec, is not the message the scheduler wrote."
exit 1
