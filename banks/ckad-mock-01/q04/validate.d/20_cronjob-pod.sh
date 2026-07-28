#!/usr/bin/env bash
# points: 1
# desc: CronJob pod template: container rotate, busybox:1.37, restartPolicy OnFailure
set -uo pipefail
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
[ -n "$img" ] || { echo "no container named 'rotate' in the CronJob's Pod template"; exit 1; }
[ "$img" = "busybox:1.37" ] || { echo "image is '$img', want 'busybox:1.37'"; exit 1; }
[ "$restart" = "OnFailure" ] || { echo "restartPolicy is '$restart', want 'OnFailure'"; exit 1; }
echo "pod template ok"
