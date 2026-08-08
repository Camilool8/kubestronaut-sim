#!/usr/bin/env bash
# points: 3
# desc: the overlay renders the env var and the shortened probe delay
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual yaml "$out"
  show_why "$1"
}

out=$(kubectl kustomize /opt/course/35/overlays/prod 2>&1)
[ $? -eq 0 ] || {
  echo "kubectl kustomize failed: $(printf '%s' "$out" | head -2)"
  show_actual text "$out"
  show_why "The overlay does not build at all, and the error above names the field. Building it costs nothing and touches nothing, so it is the fastest way to see what a kustomization produces before applying it — every key is validated strictly, and a misspelled one is refused rather than ignored."
  exit 1
}

dep=$(printf '%s' "$out" | yq 'select(.kind == "Deployment")' - 2>/dev/null)
[ -n "$dep" ] || {
  echo "the overlay renders no Deployment"
  evidence "The build produced no Deployment, which means the base is not being included: an overlay lists the base under resources, and without it there is nothing to patch and the build renders only what the overlay itself declares."
  exit 1
}

api='.spec.template.spec.containers[] | select(.name == "api")'
mode=$(printf '%s' "$dep" | yq -r "$api | .env[]? | select(.name == \"LEDGER_MODE\") | .value" - 2>/dev/null)
delay=$(printf '%s' "$dep" | yq -r "$api | .readinessProbe.initialDelaySeconds" - 2>/dev/null)
probe=$(printf '%s %s %s' \
  "$(printf '%s' "$dep" | yq -r "$api | .readinessProbe.httpGet.path" - 2>/dev/null)" \
  "$(printf '%s' "$dep" | yq -r "$api | .readinessProbe.httpGet.port" - 2>/dev/null)" \
  "$(printf '%s' "$dep" | yq -r "$api | .readinessProbe.periodSeconds" - 2>/dev/null)")

crit 1 "the container carries LEDGER_MODE=prod" \
  "rendered LEDGER_MODE is '$mode', want prod" \
  "There is no env transformer in a kustomization, which is why this needs a patch. A strategic merge patch matches the container by its name field and merges into it, so the container's name has to appear in the patch even though nothing about it is changing." \
  -- [ "$mode" = "prod" ]

crit 1 "the readiness probe starts after 5 seconds" \
  "rendered initialDelaySeconds is '$delay', want 5" \
  "The base waits 30 seconds before probing at all. Overriding one field of a probe is again beyond any transformer, so it belongs in the same patch." \
  -- [ "$delay" = "5" ]

crit 1 "and the rest of the probe survived the patch" \
  "rendered probe is path/port/period '$probe', want '/ 80 10'" \
  "readinessProbe is a struct, so a strategic merge patch merges it field by field: naming initialDelaySeconds alone leaves httpGet and periodSeconds exactly as the base has them. This is what separates a patch from a replacement — everything you do not mention is left alone — and it is also where a JSON 6902 'replace' on the whole probe would have taken the rest of it with it." \
  -- [ "$probe" = "/ 80 10" ]

crit_all_passed || evidence "$(crit_why)"
report "the overlay renders the env var and the shortened probe"
