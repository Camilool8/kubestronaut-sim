#!/usr/bin/env bash
# points: 2
# desc: /opt/course/9/manifest.yaml renders the storefront release from sim-web 1.1.0 with both overrides
set -uo pipefail
. /banks/_lib/checks.sh
F=/opt/course/9/manifest.yaml
evidence() {
  show_actual yaml "$(cat "$F" 2>/dev/null)"
  show_why "$1"
}

[ -f "$F" ] || {
  echo "$F does not exist"
  show_actual text "$(ls -l /opt/course/9/ 2>/dev/null)"
  show_why "The rendered manifests are a deliverable of this question, not scaffolding for it: the render prints to stdout and has to be redirected to that exact path. Nothing is there — the directory listing above is everything /opt/course/9 holds."
  exit 1
}

# yq prints a --- separator between the results of a multi-document file, so the
# separator has to come back out before the kinds are compared as a set.
#
# The same filter is on the three reads below, and there it is load-bearing
# rather than tidy. `select` drops a document it does not match, but yq still
# emits the separator that stood in front of it: a file whose Service comes
# first answers a Deployment query with a blank line, then `---`, then the
# value. `head -1` would take the blank, and the criterion would report a
# correct render as having asked for '' replicas of ''. Which object a chart
# renders first is the chart's business, so the read must not depend on it.
first_value() { grep -v -e '^$' -e '^---$' | head -1; }
kinds=$(yq -r '.kind // ""' "$F" 2>/dev/null | grep -v -e '^$' -e '^---$' | sort -u)
names=$(yq -r '.metadata.name // ""' "$F" 2>/dev/null | grep -v -e '^$' -e '^---$' | sort -u)
reps=$(yq -r 'select(.kind == "Deployment") | .spec.replicas // ""' "$F" 2>/dev/null | first_value)
img=$(yq -r 'select(.kind == "Deployment") | .spec.template.spec.containers[].image // ""' "$F" 2>/dev/null | first_value)
port=$(yq -r 'select(.kind == "Service") | .spec.ports[].port // ""' "$F" 2>/dev/null | first_value)

renders_the_release() {
  same_set "$kinds" "$(printf 'Deployment\nService')" && [ "$names" = "storefront" ]
}
carries_the_overrides() {
  [ "$reps" = "3" ] && [ "$img" = "nginx:1.29-alpine" ] && [ "$port" = "8080" ]
}

crit 1 "holds the release's Deployment and Service, named after the release" \
  "the file renders kinds '$(printf '%s' "$kinds" | tr '\n' ' ')' named '$(printf '%s' "$names" | tr '\n' ' ')', want a Deployment and a Service both named storefront" \
  "The sim-web chart renders exactly two objects and names each after the release, because its templates build metadata.name from .Release.Name. So the release name is an argument of the render rather than decoration: get it wrong and the file describes a release that does not exist. A file holding something else entirely — a whole other chart, or the values you passed rather than the output — was produced by a different command than the one this asks for." \
  -- renders_the_release

crit 1 "was rendered from chart 1.1.0 with both overrides" \
  "the rendered Deployment asks for '$reps' replicas of '$img' and the Service publishes port '$port'; want 3, nginx:1.29-alpine and 8080" \
  "The render takes the same chart version and the same values as the release, so what comes out has to match what is installed. nginx:1.29-alpine is the 1.1.0 chart's own default and is not something you set — 1.27-alpine here means the file was rendered from 1.0.0. Defaults of 1 replica and port 80 mean the overrides were left off this command: the render is a fresh evaluation of the chart and inherits nothing from the release unless you pass it." \
  -- carries_the_overrides

crit_all_passed || evidence "$(crit_why)"
report "manifest.yaml renders storefront from sim-web 1.1.0 (${reps} replicas, ${img}, port ${port})"
