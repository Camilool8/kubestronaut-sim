#!/usr/bin/env bash
# points: 1
# desc: CronJob pod template: container rotate, busybox:1.37, restartPolicy OnFailure
# expected: cronjob-pod.json json
set -uo pipefail
. /banks/_lib/checks.sh
tpl='.spec.jobTemplate.spec.template.spec'

snapshot() {
  kubectl -n vega get cronjob log-rotate -o json 2>/dev/null \
    | jq -S '.spec.jobTemplate.spec.template.spec as $t
             | {restartPolicy: ($t.restartPolicy // null),
                image: (first($t.containers[]? | select(.name=="rotate")) | .image // null)}'
}

evidence() {
  show_pair json cronjob-pod.json
  show_why "$1"
}

names=$(kubectl -n vega get cronjob log-rotate -o jsonpath="{${tpl}.containers[*].name}" 2>/dev/null)
has_name "$names" rotate || {
  echo "no container named 'rotate' in the CronJob's Pod template (found: $(name_list "$names"))"
  show_actual text "containers that exist: $(name_list "$names")"
  show_why "The container is found by name, and the question names it rotate. kubectl create cronjob names the container after the CronJob instead, so a generated manifest has to be renamed — everything else about the template is read off that name and is beside the point while no container carries it."
  exit 1
}

img=$(kubectl -n vega get cronjob log-rotate -o jsonpath="{${tpl}.containers[?(@.name==\"rotate\")].image}" 2>/dev/null)
restart=$(kubectl -n vega get cronjob log-rotate -o jsonpath="{${tpl}.restartPolicy}" 2>/dev/null)

crit 1 "runs busybox:1.37" \
  "image is '$img', want 'busybox:1.37'" \
  "The image is pinned to a tag on purpose: the CronJob's Pods are created fresh on every run, so an image that cannot be pulled produces a Job that fails every five minutes rather than one visible error." \
  -- [ "$img" = "busybox:1.37" ]

crit 1 "restartPolicy OnFailure" \
  "restartPolicy is '$restart', want 'OnFailure'" \
  "A Job's Pod may only be OnFailure or Never — Always is rejected by the API, because a Pod that always restarts could never let its Job complete. OnFailure restarts the container in place; Never leaves the Pod failed and has the Job create a whole new one for the next attempt. The generator emits Never, so this is the field to change after generating." \
  -- [ "$restart" = "OnFailure" ]

crit_all_passed || evidence "$(crit_why)"
report "pod template ok"
