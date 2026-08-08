#!/usr/bin/env bash
# points: 2
# desc: the kubelet's probe-failure message and the port it named were captured
set -uo pipefail
. /banks/_lib/checks.sh

evidence() {
  show_actual text "$(head -30 /opt/course/43/evidence 2>/dev/null)"
  show_why "$1"
}

# Two fragments, both stable across releases: the kubelet always names the probe
# that failed this way, and the address it dialled always carries the port. The
# wording between and around them is not matched, because it is not the answer.
holds() { grep -qi -- "$1" /opt/course/43/evidence 2>/dev/null; }

crit 1 "the kubelet's own message about the failing check" \
  "/opt/course/43/evidence does not contain the kubelet's probe-failure message" \
  "A container being killed from outside leaves nothing in its log — the log ends mid-sentence and the next one starts clean. The reason is an event on the Pod, reason Unhealthy, from the kubelet, and it names which of the three probes failed. Describing the Pod prints the same events under the spec." \
  -- holds 'liveness probe failed'

crit 1 "the port the check was aimed at" \
  "/opt/course/43/evidence does not name the port the probe was dialling" \
  "The event quotes the URL the kubelet requested, and the address in it is the Pod's own IP with the probe's port on the end — the kubelet reaches the container directly on the node and never through a Service. That port against the one the container is declared to serve on is the whole diagnosis, so the file has to carry it." \
  -- holds '8080'

crit_all_passed || evidence "$(crit_why)"
report "probe failure recorded"
