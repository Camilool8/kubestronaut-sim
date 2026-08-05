#!/usr/bin/env bash
# points: 4
# desc: an ephemeral container named debugger runs busybox:1.37 targeting api, in the original Pod
set -uo pipefail
. /banks/_lib/checks.sh

evidence() {
  show_actual json "$(kubectl -n perseus get pod ledger-api -o json 2>/dev/null \
    | jq '{containers: [.spec.containers[].name],
           ephemeralContainers: [.spec.ephemeralContainers // [] | .[]
             | {name, image, targetContainerName}]}')"
  show_why "$1"
}

# The Pod has to be the one that was already there. `kubectl debug` never
# restarts anything — an ephemeral container is added through a
# subresource on the live Pod — so a Pod that was deleted and recreated
# is a different answer to a different question, and it also threw away
# whatever state was being diagnosed.
containers=$(kubectl -n perseus get pod ledger-api \
  -o jsonpath='{range .spec.containers[*]}{.name}{"\n"}{end}' 2>/dev/null)
[ -n "$containers" ] || {
  echo "there is no Pod ledger-api in perseus"
  show_why "Ephemeral containers are added to a Pod that exists. If it is gone, there is nothing to debug and nothing to attach to — and deleting it is the one thing the question rules out, because on a real incident the Pod IS the evidence."
  exit 1
}
same_set "$containers" "api" || {
  echo "the Pod's containers are '$(printf '%s' "$containers" | tr '\n' ' ')', want exactly one named api"
  evidence "spec.containers is immutable on a running Pod, so a changed container list means the Pod was deleted and replaced. An ephemeral container is not added there — it lives in spec.ephemeralContainers, which is why it can be added to a Pod that is already running."
  exit 1
}

eph=$(kubectl -n perseus get pod ledger-api -o json 2>/dev/null \
  | jq -r '.spec.ephemeralContainers // [] | map(select(.name == "debugger")) | first // empty')
[ -n "$eph" ] || {
  echo "the Pod has no ephemeral container named debugger"
  evidence "kubectl debug names the container it adds with -c/--container; left to itself it invents a name like debugger-8kx2t, which is fine in a terminal and not what the question asks for. The name is recorded in the Pod spec permanently — an ephemeral container can never be removed, only stopped."
  exit 1
}

img=$(printf '%s' "$eph" | jq -r '.image // ""')
[ "$img" = "busybox:1.37" ] || {
  echo "the debugger container runs '$img', want busybox:1.37"
  evidence "The whole point of a debugging image is that it carries tools the application image does not have to ship. Which image you pick is the --image flag, and it is the only reason the ephemeral container is worth adding."
  exit 1
}

target=$(printf '%s' "$eph" | jq -r '.targetContainerName // ""')
[ "$target" = "api" ] || {
  echo "targetContainerName is '$target', want api"
  evidence "Without --target, an ephemeral container shares the Pod's network and IPC but gets a process namespace of its own, so 'ps' shows only itself. Naming the target joins that container's process namespace, which is what makes another container's processes and its /proc visible at all."
  exit 1
}

echo "ephemeral debugger attached"
