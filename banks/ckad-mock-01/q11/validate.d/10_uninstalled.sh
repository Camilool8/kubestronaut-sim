#!/usr/bin/env bash
# points: 3
# desc: report-api-v1 and the failed release are gone, report-web untouched
set -uo pipefail
. /banks/_lib/checks.sh
export HELM_NAMESPACE=carina
evidence() {
  show_actual text "$(helm ls -a 2>/dev/null)"
  show_why "$1"
}

releases=$(helm ls -a -o json 2>/dev/null | jq -r '.[].name' | sort | tr '\n' ' ')

# The question rules this one out: report-web was named as the release to leave
# untouched, so removing it is not a partial answer to anything.
has_name "$releases" report-web || {
  echo "report-web should have been left alone (releases: $releases)"
  evidence "Removing everything is not the answer: report-web was named as the one to leave untouched, and it is gone. Two named releases were to be uninstalled and no others."
  exit 1
}

crit 1 "report-api-v1 was uninstalled" \
  "report-api-v1 is still installed" \
  "Uninstalling removes the release RECORD as well as the objects it created. Deleting the Deployment with kubectl reaches a similar-looking cluster and leaves Helm still listing the release, still believing it owns things that are gone — and the next upgrade would put them back." \
  -- negate has_name "$releases" report-api-v1

crit 2 "the failed release report-legacy was found and uninstalled" \
  "the failed release report-legacy is still installed" \
  "This is the release the question asks you to find. helm ls shows only deployed releases, so a failed one is invisible without asking for all of them — which is the point of the task. It failed because it was installed with an image tag that does not exist, so its Pods never became ready; its objects stay in the cluster until the release is uninstalled." \
  -- negate has_name "$releases" report-legacy

crit_all_passed || evidence "$(crit_why)"
report "releases uninstalled"
echo "uninstalls ok"
