#!/usr/bin/env bash
# points: 1
# desc: the archiver Pod is running with its volumes attached
set -uo pipefail
# A Pod referencing an unbindable claim sits in Pending indefinitely, so
# Running is what proves the storage actually attached.
phase=$(kubectl -n orion get pod archiver -o jsonpath='{.status.phase}' 2>/dev/null)
[ "$phase" = "Running" ] \
  && echo "running" \
  || { echo "phase is '$phase', want Running"; exit 1; }
