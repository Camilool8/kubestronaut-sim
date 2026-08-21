#!/usr/bin/env bash
# points: 4
# desc: the adapter really rewrites the app's output into key/value lines
# expected: none — the check execs into the adapter and reads whatever its
#           command currently emits, a live process reading taken at the
#           moment the check runs rather than a document the candidate wrote;
#           the message and evidence pane already carry the actual output.
set -uo pipefail
. /banks/_lib/checks.sh
out=$(kubectl -n pictor exec telemetry -c adapter -- \
  cat /var/run/telemetry/metrics.prom 2>/dev/null)
[ -n "$out" ] || {
  echo "/var/run/telemetry/metrics.prom is missing or empty in the adapter"
  show_actual text "$(kubectl -n pictor exec telemetry -c adapter -- \
    ls -l /var/run/telemetry 2>/dev/null)"
  show_why "Nothing readable came out of the shared directory, and the listing above is what the ADAPTER can see in it. An empty listing means the two containers are not really sharing — a different mount path in each, or one missing its mount entirely. A raw file present but no rewritten one means the adapter's own command is not running."
  exit 1
}

crit 2 "rewrote the cpu reading as a key/value line" \
  "no 'cpu 42' line; got: $(printf '%s' "$out" | tr '\n' '|')" \
  "The adapter's whole job is a format change: the app's one line of private text becomes one key/value pair per line, with the separator becoming a line break and the equals sign becoming a space. Whitespace between the key and the value is not part of the answer — the pair is." \
  -- contains_pair "$out" "cpu" "42"

crit 1 "and the mem reading too" \
  "no 'mem 71' line; got: $(printf '%s' "$out" | tr '\n' '|')" \
  "One pair coming through and the other not means the rewrite is only half happening — the app writes both readings on a single line, and both have to survive the conversion into separate lines." \
  -- contains_pair "$out" "mem" "71"

crit_all_passed || {
  show_actual text "$out"
  show_why "$(crit_why)"
}
report "adapter output ok"
