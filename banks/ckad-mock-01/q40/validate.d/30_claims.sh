#!/usr/bin/env bash
# points: 2
# desc: one Bound claim per ordinal, data-ledger-0 and data-ledger-1, both recorded
set -uo pipefail
. /banks/_lib/checks.sh

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

crit_all_passed || {
  show_actual text "$(kubectl -n cepheus get pvc 2>&1; echo; echo '/opt/course/40/claims:'; cat /opt/course/40/claims 2>&1)"
  show_why "$(crit_why)"
}
report "one bound claim per replica, recorded"
