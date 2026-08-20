#!/usr/bin/env bash
# points: 6
# desc: the node-probe Pod runs on sim-worker3 and the kubelet unit is enabled to start at boot
set -uo pipefail
. /banks/_lib/checks.sh

NS=q07-probe
NODE=sim-worker3
DEP=node-probe
UNIT=kubelet.service
WANTS=/host-units/multi-user.target.wants

dep=$(kubectl -n "$NS" get deploy "$DEP" -o json 2>/dev/null \
  | jq '{name: (.metadata.name // null),
         replicas: (.spec.replicas // 1),
         selector: (.spec.selector.matchLabels // {}),
         nodeSelector: (.spec.template.spec.nodeSelector // {}),
         nodeName: (.spec.template.spec.nodeName // ""),
         tolerations: (.spec.template.spec.tolerations // [])}' 2>/dev/null)

pods=''
wants_json=''

evidence() {
  show_actual json "$(printf '{"%s": %s, "its Pods": %s, "unit files linked into multi-user.target on %s": %s}' \
    "$DEP" "${dep:-null}" "${pods:-null}" "$NODE" "${wants_json:-null}")"
  show_why "$1"
}

name=$(printf '%s' "${dep:-null}" | jq -r '.name // ""' 2>/dev/null)

# Do-no-harm, so gates rather than criteria: all of these are true of the
# untouched seed, and a criterion the seed already satisfies is a point awarded
# for no work. They are also the shortest wrong paths through this question —
# every one of them makes the probe run somewhere the maintenance was never
# needed, which would then be read back as a repaired node.
[ -n "$name" ] || {
  echo "Deployment $DEP is gone from Namespace $NS"
  show_actual text "$(kubectl -n "$NS" get deploy 2>/dev/null)"
  show_why "The probe is how this question can tell a node that answers the API from a node that can actually run something, so it has to still be there at the end. Deleting it also does not help: the Pod is Pending because the machine it is pinned to has nothing on it willing to start containers, and removing the Deployment removes the symptom rather than the fault. Re-create it — banks/${BANK:-cka-mock-01}/q07/setup.sh holds the manifest it was seeded from, and a reset re-seeds it — then repair the node and let the Pod start on its own."
  exit 1
}

pin=$(printf '%s' "${dep:-null}" | jq -r '.nodeSelector["kubernetes.io/hostname"] // ""' 2>/dev/null)
[ "$pin" = "$NODE" ] || {
  echo "$DEP no longer pins its Pods to $NODE (kubernetes.io/hostname nodeSelector: '${pin:-<none>}')"
  evidence "The question asks for the probe to be left pinned where it is, and this is the field that was changed. Re-aiming or removing the hostname pin does make the Pod Running — on a healthy worker, which was never the one that needed fixing — and it takes the only evidence there was that $NODE can run a container away with it. A Pending Pod is the symptom here, not the fault. Put the nodeSelector back on spec.template.spec: kubernetes.io/hostname: $NODE."
  exit 1
}

nodename=$(printf '%s' "${dep:-null}" | jq -r '.nodeName // ""' 2>/dev/null)
[ -z "$nodename" ] || [ "$nodename" = "$NODE" ] || {
  echo "$DEP now sets spec.template.spec.nodeName to '$nodename'"
  evidence "A nodeName written into a Pod template bypasses the scheduler and places the Pod directly, which here means placing the probe on a machine other than the one under maintenance. Remove it; the hostname nodeSelector is what decides where this workload belongs."
  exit 1
}

replicas=$(printf '%s' "${dep:-null}" | jq -r '.replicas // 0' 2>/dev/null)
case ${replicas:-0} in
  ''|*[!0-9]*) replicas=0 ;;
esac
[ "$replicas" -ge 1 ] || {
  echo "$DEP is scaled to $replicas replicas"
  evidence "Scaling the probe to zero makes the Pending Pod disappear without anything having been repaired. Put it back with 'kubectl -n $NS scale deploy/$DEP --replicas=1'. Then repair the node itself: the Pod schedules and starts on its own the moment that machine is able to start containers again."
  exit 1
}

sel=$(printf '%s' "${dep:-null}" \
  | jq -r '[ (.selector // {}) | to_entries[] | "\(.key)=\(.value)" ] | join(",")' 2>/dev/null)

# The Deployment's own selector rather than a hard-coded label: an answer that
# re-created the workload is still the same workload, and its Pods are whatever
# its selector says they are. Pod names are shown but never graded — a
# ReplicaSet generates them and they change under every restart.
pods=$(kubectl -n "$NS" get pod -l "${sel:-app=$DEP}" -o json 2>/dev/null | jq -c '
  [ .items[]? | select(.metadata.deletionTimestamp == null)
              | {pod: .metadata.name,
                 node: (.spec.nodeName // ""),
                 phase: (.status.phase // ""),
                 ready: ([ .status.conditions[]?
                           | select(.type == "Ready") | .status ] | join("")),
                 reason: ([ .status.conditions[]?
                            | select(.type == "PodScheduled" and .status != "True")
                            | (.reason // "") ] | join(""))} ]' 2>/dev/null)

pod=$(printf '%s' "${pods:-[]}" \
  | jq -r --arg n "$NODE" 'first(.[]? | select(.node == $n and .phase == "Running") | .pod) // ""' 2>/dev/null)

# The behavioural half, and the reason this is not just a phase read. A Pod's
# status is written by its node's kubelet; when that kubelet stops, the last
# status it wrote stays on the object untouched, so "Running" on its own can
# describe a Pod on a machine that is running nothing at all. An exec is
# different: the API server opens a stream to the kubelet on that node and the
# command runs inside the container. It cannot succeed unless the node really is
# serving, which is exactly the thing being graded.
wants=''
exec_ok=no
if [ -n "$pod" ]; then
  if wants=$(timeout 15 kubectl -n "$NS" exec "$pod" -c probe -- ls "$WANTS" 2>/dev/null); then
    exec_ok=yes
  fi
fi
wants_json=$(printf '%s' "$wants" | jq -Rs '.' 2>/dev/null)

running_here() { [ -n "$pod" ] && [ "$exec_ok" = "yes" ]; }

placed=$(printf '%s' "${pods:-[]}" \
  | jq -r '[ .[]? | "\(.pod) \(.phase) on \(if .node == "" then "<unscheduled>" else .node end)" ] | join("; ")' 2>/dev/null)

# Two different failures, and telling them apart is most of the diagnosis. No
# Pod running here at all is the untouched fault; a Pod that reads Running but
# cannot be exec'd into is a status frozen at whatever its kubelet last wrote.
if [ -n "$pod" ]; then
  probe_msg="$DEP Pod '$pod' is recorded as Running on $NODE, but the API could not reach into it — that status was written before its kubelet stopped"
else
  probe_msg="no $DEP Pod is Running on $NODE: ${placed:-no Pods at all}"
fi

crit 3 "$DEP is running on $NODE and answers an exec" \
  "$probe_msg" \
  "This is the half that proves the node is back in service rather than merely back in the node list. The Pod was already assigned to $NODE — a blanket toleration lets the scheduler place it on a node the node controller has tainted as unreachable — so nothing about scheduling is being graded here; it has been sitting Pending because there was no kubelet on that machine to pull an image and start a container. Repair the node and this Pod starts on its own within seconds, with no help from you. The check then runs 'ls' inside the container through the API, which the API server can only do by streaming to the kubelet on that node, so a Pod whose status merely still SAYS Running — the frozen last word of a kubelet that has since stopped — does not satisfy it." \
  -- running_here

crit 3 "the kubelet unit is enabled to start at boot" \
  "$UNIT is not linked into multi-user.target on $NODE (linked units: $(name_list "$wants"))" \
  "Starting a systemd service and enabling it are two different operations, and only one of them survives a reboot. 'systemctl start kubelet' runs the unit now and writes nothing to disk; 'systemctl enable kubelet' creates the symlink /etc/systemd/system/multi-user.target.wants/kubelet.service, which is what makes systemd start the unit on the next boot. 'systemctl enable --now kubelet' does both in one command, and 'systemctl is-enabled kubelet' tells you which state you are in. This node was left with the unit stopped AND disabled, so a repair that only starts it looks completely correct until the machine restarts — at which point the node goes NotReady again. The criterion is read by listing that directory through the probe Pod, which mounts the node's /etc/systemd/system read-only." \
  -- has_name "$wants" "$UNIT"

crit_all_passed || evidence "$(crit_why)"
report "$NODE is running workloads again and its kubelet is enabled for boot"
