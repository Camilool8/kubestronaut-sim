#!/usr/bin/env bash
# points: 3
# desc: report-cache installed from sim-cache with 2 replicas set via values
set -uo pipefail
. /banks/_lib/checks.sh
export HELM_NAMESPACE=carina
evidence() {
  show_actual text "$(helm ls -a 2>/dev/null; echo; helm -n carina get values report-cache 2>/dev/null)"
  show_why "$1"
}

chart=$(helm ls -o json 2>/dev/null | jq -r '.[] | select(.name == "report-cache") | .chart')
[ -n "$chart" ] || {
  echo "report-cache is not installed"
  evidence "There is no release called report-cache. The release name is chosen at install time and is separate from the chart it renders — one chart can back many releases, each with its own values and history."
  exit 1
}
printf '%s' "$chart" | grep -q '^sim-cache-' || {
  echo "report-cache uses chart '$chart', want sim-cache"
  evidence "The release exists but was installed from a different chart. The chart is what supplies the templates and the default values; the name of the release says nothing about which one was used."
  exit 1
}

replicas=$(kubectl -n carina get deploy report-cache -o jsonpath='{.spec.replicas}' 2>/dev/null)
[ "$replicas" = "2" ] || {
  echo "Deployment report-cache has $replicas replicas, want 2"
  evidence "The rendered Deployment does not carry 2 replicas. The chart exposes that as a value, so it is set when the release is installed rather than edited afterwards — the values the release actually holds are shown above."
  exit 1
}

# The question says "through Helm values", so the release's own values
# have to carry it. Scaling the Deployment afterwards would satisfy the
# check above and be undone by the next `helm upgrade`.
value=$(helm -n carina get values report-cache -o json 2>/dev/null | jq -r '.replicaCount // empty')
[ "$value" = "2" ] && echo "installed with replicaCount=2" || {
  echo "release values do not set replicaCount=2 (got '$value') — was the Deployment scaled instead?"
  evidence "The Deployment has two replicas but the RELEASE does not ask for them, so this was a kubectl scale rather than a Helm value. It reaches the same count today and loses it at the next upgrade, because the chart is re-rendered from the values and the values still say one. That is why the question says 'through Helm values' and why this is checked separately."
  exit 1
}
