#!/usr/bin/env bash
# points: 1
# desc: CronJob pod template: container rotate, busybox:1.37, restartPolicy OnFailure
set -uo pipefail
. /banks/_lib/checks.sh
evidence() {
  show_actual json "$(kubectl -n vega get cronjob log-rotate -o json 2>/dev/null | jq '.spec.jobTemplate.spec.template.spec | {restartPolicy, containers: [.containers[] | {name, image}]}')"
  show_why "$1"
}

# The prefix carries no closing brace: it is completed per-field below.
# Written the other way round, `{...spec}` terminates the jsonpath
# expression and everything after it is emitted as literal text — which
# looks like the whole Pod spec plus a stray suffix, not like a bug.
tpl='.spec.jobTemplate.spec.template.spec'
# Selected by name, which also *is* the name assertion: an empty result
# means no container called `rotate`, whatever else the template holds.
# Reading [0].name instead asked whether the first container happened to
# be the right one, which is a different question and a weaker one.
img=$(kubectl -n vega get cronjob log-rotate -o jsonpath="{${tpl}.containers[?(@.name==\"rotate\")].image}" 2>/dev/null)
restart=$(kubectl -n vega get cronjob log-rotate -o jsonpath="{${tpl}.restartPolicy}" 2>/dev/null)
[ -n "$img" ] || {
  echo "no container named 'rotate' in the CronJob's Pod template"
  evidence "The container is found by name, and the question names it rotate. kubectl create cronjob names the container after the CronJob instead, so a generated manifest has to be renamed — everything else about the template is beside the point while no container carries that name."
  exit 1
}
[ "$img" = "busybox:1.37" ] || {
  echo "image is '$img', want 'busybox:1.37'"
  evidence "The image is pinned to a tag on purpose: the CronJob's Pods are created fresh on every run, so an image that cannot be pulled produces a Job that fails every five minutes rather than one visible error."
  exit 1
}
[ "$restart" = "OnFailure" ] || {
  echo "restartPolicy is '$restart', want 'OnFailure'"
  evidence "A Job's Pod may only be OnFailure or Never — Always is rejected by the API, because a Pod that always restarts could never let its Job complete. OnFailure restarts the container in place; Never leaves the Pod failed and has the Job create a whole new one for the next attempt. The generator emits Never, so this is the field to change after generating."
  exit 1
}
echo "pod template ok"
