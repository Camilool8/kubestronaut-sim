#!/usr/bin/env bash
# points: 2
# desc: the overlay was applied to norma and is running
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n norma get deploy ledger-api -o json 2>/dev/null \
    | jq '{ready: .status.readyReplicas,
            container: [.spec.template.spec.containers[] | select(.name == "api")
                        | {env, readinessProbe}]}')"
  show_why "$1"
}

kubectl -n norma get deploy ledger-api >/dev/null 2>&1 || {
  echo "Deployment ledger-api does not exist in namespace norma"
  show_actual text "$(kubectl -n norma get deploy 2>/dev/null)"
  show_why "An overlay can render perfectly and still not be in the cluster — building it and applying it are two separate acts. A kustomization directory is applied the way a file is, with -k in place of -f, and until that runs this Namespace holds whatever was there before."
  exit 1
}

spec=$(kubectl -n norma get deploy ledger-api -o json 2>/dev/null)
mode=$(printf '%s' "$spec" | jq -r '[.spec.template.spec.containers[] | select(.name == "api")
  | (.env // [])[] | select(.name == "LEDGER_MODE") | .value] | join(",")')
delay=$(kubectl -n norma get deploy ledger-api \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].readinessProbe.initialDelaySeconds}' 2>/dev/null)
ready=$(printf '%s' "$spec" | jq -r '.status.readyReplicas // 0')

patch_landed() { [ "$mode" = "prod" ] && [ "$delay" = "5" ]; }

crit 1 "the patched fields reached the cluster" \
  "in-cluster LEDGER_MODE is '$mode' and initialDelaySeconds is '$delay', want prod and 5" \
  "This is the rendered overlay as the API server stored it. A mismatch with what kubectl kustomize prints means the build was right and something else was applied — usually a hand-written manifest, or the overlay applied before the last edit to it." \
  -- patch_landed

crit 1 "both replicas are ready" \
  "readyReplicas is '$ready', want 2" \
  "The base asks for 2 replicas and this overlay does not change that. A shorter initialDelaySeconds makes them ready sooner rather than less often, so a gap here is Pods still starting or an image the nodes cannot fetch." \
  -- [ "$ready" = "2" ]

crit_all_passed || evidence "$(crit_why)"
report "applied to norma, 2/2 ready with the patch in place"
