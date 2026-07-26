#!/usr/bin/env bash
# points: 1
# desc: CronJob pod template: container rotate, busybox:1.37, restartPolicy OnFailure
set -uo pipefail
# The prefix carries no closing brace: it is completed per-field below.
# Written the other way round, `{...spec}` terminates the jsonpath
# expression and everything after it is emitted as literal text — which
# looks like the whole Pod spec plus a stray suffix, not like a bug.
tpl='.spec.jobTemplate.spec.template.spec'
name=$(kubectl -n vega get cronjob log-rotate -o jsonpath="{${tpl}.containers[0].name}" 2>/dev/null)
img=$(kubectl -n vega get cronjob log-rotate -o jsonpath="{${tpl}.containers[0].image}" 2>/dev/null)
restart=$(kubectl -n vega get cronjob log-rotate -o jsonpath="{${tpl}.restartPolicy}" 2>/dev/null)
[ "$name" = "rotate" ] || { echo "container name is '$name', want 'rotate'"; exit 1; }
[ "$img" = "busybox:1.37" ] || { echo "image is '$img', want 'busybox:1.37'"; exit 1; }
[ "$restart" = "OnFailure" ] || { echo "restartPolicy is '$restart', want 'OnFailure'"; exit 1; }
echo "pod template ok"
