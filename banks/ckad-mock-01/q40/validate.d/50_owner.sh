#!/usr/bin/env bash
# points: 1
# desc: each replica wrote its own name into its own volume at /data/owner
set -uo pipefail
. /banks/_lib/checks.sh

owner() { kubectl -n cepheus exec "$1" -- cat /data/owner 2>/dev/null | tr -d '[:space:]'; }
zero=$(owner ledger-0)
one=$(owner ledger-1)

crit 1 "ledger-0 holds its own name" \
  "/data/owner in ledger-0 reads '$zero', want ledger-0" \
  "The file has to be written inside the Pod, on the mounted volume — writing it on the instance puts it somewhere no container can see. An empty reading means either no file at that path or nothing mounted there at all." \
  -- [ "$zero" = "ledger-0" ]

crit 1 "ledger-1 holds its own, different name" \
  "/data/owner in ledger-1 reads '$one', want ledger-1" \
  "Both replicas reading the same value would mean they share one volume, which is precisely what a StatefulSet is chosen to avoid. Each ordinal mounts the claim generated for it, so the two files are independent and a replacement Pod finds the value its predecessor left." \
  -- [ "$one" = "ledger-1" ]

crit_all_passed || {
  show_actual text "$(kubectl -n cepheus get pod 2>&1; echo; printf 'ledger-0 /data/owner: %s\nledger-1 /data/owner: %s\n' "$zero" "$one")"
  show_why "$(crit_why)"
}
report "each replica owns its own volume"
