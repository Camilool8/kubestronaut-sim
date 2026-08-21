#!/usr/bin/env bash
# points: 1
# desc: the rewritten Job reached 4 successful Pods and reports Complete
# expected: none — the check grades whether the Job's own status has reached
#           its terminal Complete condition with 4 successful Pods, a reading
#           taken at a moment rather than a document the candidate authored.
#           The message already names the count and condition seen.
set -uo pipefail
. /banks/_lib/checks.sh

status=$(kubectl -n eridanus get job ledger-reconcile -o json 2>/dev/null | jq '.status')
[ -n "$status" ] && [ "$status" != "null" ] || {
  echo "there is no Job ledger-reconcile in eridanus to have completed"
  show_actual text "$(kubectl -n eridanus get job 2>/dev/null)"
  show_why "The Job that had given up was to be replaced by one under the same name that finishes. Nothing is there under that name now."
  exit 1
}

succeeded=$(printf '%s' "$status" | jq -r '.succeeded // 0')
complete=$(printf '%s' "$status" | jq -r 'first(.conditions[]? | select(.type == "Complete") | .status) // "-"')

[ "$succeeded" = "4" ] && [ "$complete" = "True" ] && { echo "job complete"; exit 0; }

echo "the Job reports $succeeded successful Pods and Complete='$complete', want 4 and True"
show_actual json "$(printf '%s' "$status" | jq '{succeeded, failed, active,
  conditions: [.conditions[]? | {type, status, reason}]}')"
show_why "status.succeeded counts Pods that exited zero, and a Job is marked Complete only once that number reaches spec.completions. A Job still counting means this was graded before it finished; a Job with a Failed condition instead means the work itself is still exiting non-zero, or that activeDeadlineSeconds ran out before the last completion landed."
exit 1
