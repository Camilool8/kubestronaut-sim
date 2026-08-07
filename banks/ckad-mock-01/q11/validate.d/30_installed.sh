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
replicas=$(kubectl -n carina get deploy report-cache -o jsonpath='{.spec.replicas}' 2>/dev/null)
value=$(helm -n carina get values report-cache -o json 2>/dev/null | jq -r '.replicaCount // empty')
from_sim_cache() { printf '%s' "$chart" | grep -q '^sim-cache-'; }

crit 1 "installed from the sim-cache chart" \
  "report-cache uses chart '$chart', want sim-cache" \
  "The release exists but was installed from a different chart. The chart is what supplies the templates and the default values; the name of the release says nothing about which one was used." \
  -- from_sim_cache

crit 1 "the Deployment runs 2 replicas" \
  "Deployment report-cache has $replicas replicas, want 2" \
  "The rendered Deployment does not carry 2 replicas. The chart exposes that as a value, so it is set when the release is installed rather than edited afterwards — the values the release actually holds are shown above." \
  -- [ "$replicas" = "2" ]

crit 1 "the count came from a Helm value" \
  "release values do not set replicaCount=2 (got '$value') — was the Deployment scaled instead?" \
  "The Deployment may have two replicas while the RELEASE does not ask for them, which is a kubectl scale rather than a Helm value. It reaches the same count today and loses it at the next upgrade, because the chart is re-rendered from the values and the values still say one. That is why the question says 'through Helm values' and why this is scored separately." \
  -- [ "$value" = "2" ]

crit_all_passed || evidence "$(crit_why)"
report "installed with replicaCount=2"
