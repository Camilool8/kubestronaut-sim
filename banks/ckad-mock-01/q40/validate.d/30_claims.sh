#!/usr/bin/env bash
# points: 2
# desc: one Bound claim per ordinal, data-ledger-0 and data-ledger-1, both recorded
# expected: claims.txt text
set -uo pipefail
. /banks/_lib/checks.sh

# Only the recorded-names criterion gets a generated document. Whether each
# PVC has actually reached Bound is a live status reading taken at grading
# time, not a document either side authored, and its outcome already rides
# on its own crit message below.
snapshot() {
  file_lines_sorted /opt/course/40/claims
}

evidence() {
  show_pair text claims.txt
  show_why "$1"
}

phase() { kubectl -n cepheus get pvc "$1" -o jsonpath='{.status.phase}' 2>/dev/null; }
zero=$(phase data-ledger-0)
one=$(phase data-ledger-1)
recorded=$(file_lines_sorted /opt/course/40/claims)
want=$(printf 'data-ledger-0\ndata-ledger-1')

crit 1 "data-ledger-0 is Bound" \
  "claim data-ledger-0 is '$zero', want Bound" \
  "The controller names each generated claim <template>-<statefulset>-<ordinal>, so a claim under any other name means the template, the workload or the resource kind is not the one this question asked for. Bound is what proves a volume really was provisioned for it rather than merely requested." \
  -- [ "$zero" = "Bound" ]

crit 1 "data-ledger-1 is Bound" \
  "claim data-ledger-1 is '$one', want Bound" \
  "The second ordinal is the one that shows the storage is per replica. A single claim serving both Pods is what a Deployment would have given you; here each ordinal gets a claim of its own, created when that replica is first started." \
  -- [ "$one" = "Bound" ]

crit 1 "both claim names recorded on the instance" \
  "/opt/course/40/claims does not list exactly those two names" \
  "The names are the controller's, not yours, which is why the question asks you to read them back. Names only, one per line: a kubectl table, a resource-prefixed 'persistentvolumeclaim/...' form or a line of prose is not the name, even with the name inside it." \
  -- [ "$recorded" = "$want" ]

crit_all_passed || evidence "$(crit_why)"
report "one bound claim per replica, recorded"
