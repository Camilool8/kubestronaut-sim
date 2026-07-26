#!/usr/bin/env bash
# points: 2
# desc: report-api-v1 and the failed release are gone, report-web untouched
set -uo pipefail
export HELM_NAMESPACE=carina
releases=$(helm ls -a -o json 2>/dev/null | jq -r '.[].name' | sort | tr '\n' ' ')

printf '%s' "$releases" | grep -qw report-api-v1 \
  && { echo "report-api-v1 is still installed"; exit 1; }
printf '%s' "$releases" | grep -qw report-legacy \
  && { echo "the failed release report-legacy is still installed"; exit 1; }
# Removing everything is not the answer either.
printf '%s' "$releases" | grep -qw report-web \
  || { echo "report-web should have been left alone (releases: $releases)"; exit 1; }
echo "uninstalls ok"
