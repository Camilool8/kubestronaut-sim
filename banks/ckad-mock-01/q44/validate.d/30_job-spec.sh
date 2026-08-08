#!/usr/bin/env bash
# points: 3
# desc: the rewritten Job carries the completion, concurrency and give-up settings
set -uo pipefail
. /banks/_lib/checks.sh

spec=$(kubectl -n eridanus get job ledger-reconcile -o json 2>/dev/null | jq '.spec')
[ -n "$spec" ] && [ "$spec" != "null" ] || {
  echo "there is no Job ledger-reconcile in eridanus"
  show_actual text "$(kubectl -n eridanus get job 2>/dev/null; echo; kubectl -n eridanus get pod 2>/dev/null)"
  show_why "The rewrite keeps the original name. Deleting the broken Job is the first half of it — almost every field the question asks for is immutable once a Job exists, so there is no editing your way from one to the other — but the Namespace has to end up with a Job under that name again."
  exit 1
}

evidence() {
  show_actual json "$(printf '%s' "$spec" | jq '{completions, parallelism, backoffLimit,
    activeDeadlineSeconds,
    restartPolicy: .template.spec.restartPolicy,
    containers: [.template.spec.containers[] | {name, image, command}]}')"
  show_why "$1"
}

field() { printf '%s' "$spec" | jq -r "$1 // \"-\""; }

completions=$(field '.completions')
parallelism=$(field '.parallelism')
backoff=$(field '.backoffLimit')
deadline=$(field '.activeDeadlineSeconds')
policy=$(field '.template.spec.restartPolicy')
names=$(printf '%s' "$spec" | jq -r '[.template.spec.containers[].name] | join(" ")')
img=$(printf '%s' "$spec" | jq -r 'first(.template.spec.containers[] | select(.name == "reconcile") | .image) // "-"')

crit 1 "4 completions" \
  "completions is '$completions', want 4" \
  "completions is how many Pods must SUCCEED before the Job is finished, and it defaults to 1. It is not a count of attempts: failures do not consume it, they consume backoffLimit." \
  -- [ "$completions" = "4" ]

crit 1 "2 at a time" \
  "parallelism is '$parallelism', want 2" \
  "parallelism caps how many Pods may exist at once, and defaults to 1 — which turns a multi-completion Job into a strictly serial one. Set above completions it is simply clamped down to what is left to do." \
  -- [ "$parallelism" = "2" ]

crit 1 "gives up after 4 failures" \
  "backoffLimit is '$backoff', want 4" \
  "backoffLimit counts failed Pods, not attempts remaining, and the Job fails once that count is EXCEEDED — which is why the broken Job here, at a limit of 2, left three dead Pods behind. Its default is 6." \
  -- [ "$backoff" = "4" ]

crit 1 "abandons the whole thing after 120 seconds" \
  "activeDeadlineSeconds is '$deadline', want 120" \
  "activeDeadlineSeconds is a wall clock over the entire Job rather than over one Pod, and it OUTRANKS backoffLimit: when it expires every live Pod is terminated and the Job is failed with reason DeadlineExceeded, however many retries were still owed. It belongs beside completions under spec — there is a field of the same name on the Pod template with a narrower meaning, which is the usual place to put it by mistake." \
  -- [ "$deadline" = "120" ]

crit 1 "restarts the container in place" \
  "restartPolicy is '$policy', want OnFailure" \
  "A Job's Pod template takes only Never or OnFailure; Always is rejected outright, because a Pod that always restarts can never be counted as complete. OnFailure keeps the same Pod and restarts its container, so the restart count climbs and no new Pod is scheduled. Never is the opposite bargain and is what the broken Job used: one Pod per attempt, all of them left behind to read." \
  -- [ "$policy" = "OnFailure" ]

crit 1 "still the container and image it had" \
  "the container list is '$(name_list "$names")' with reconcile on image '$img', want one named reconcile on busybox:1.37" \
  "The rewrite was to change the Job's settings, not the work it does. The container is looked up by name, so an empty image here means it was renamed rather than that the image is missing." \
  -- [ "$img" = "busybox:1.37" ]

crit_all_passed || evidence "$(crit_why)"
report "job spec ok"
