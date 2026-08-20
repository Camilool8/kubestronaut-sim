#!/usr/bin/env bash
set -euo pipefail

NS=q07-probe
NODE=sim-worker3
DEP=node-probe
TAINT=q07-maintenance=true

kubectl create ns "$NS" --dry-run=client -o yaml | kubectl apply -f -

# The node object can be missing for a few seconds at seed time: on a cold boot
# the workers join while the earlier questions are still seeding, and a previous
# attempt may have deleted it (the kubelet re-registers within seconds). Wait a
# bounded while rather than failing the whole prepare over a race.
for _ in $(seq 1 20); do
  kubectl get node "$NODE" >/dev/null 2>&1 && break
  sleep 3
done

if ! kubectl get node "$NODE" >/dev/null 2>&1; then
  echo "q07 setup: node $NODE is not registered — cannot break its kubelet" >&2
  exit 1
fi

# The taints are the seed's, not the candidate's. They are what make this node
# exclusively $DEP's, so "the probe is running here" grades the kubelet coming
# back rather than whatever the scheduler happened to put on a spare worker.
# The key is prefixed with the question id because a node taint is cluster-scoped
# state two questions could otherwise collide on — workload=batch belongs to q21
# on sim-worker2, q06-dedicated to q06 on sim-worker4. --overwrite makes the
# re-run a no-op instead of "node already has a taint with key ...".
#
# NoExecute alongside NoSchedule, and both BEFORE the kubelet is stopped: on the
# very first seed a Deployment from an earlier question may already have a
# replica here, and evicting it now — while the kubelet is still alive to
# terminate the container — hands it back to its controller to place elsewhere.
# After the kubelet is dead an eviction deletes the API object and leaves the
# container running, which is the opposite of setup-time independence. System
# DaemonSets carry blanket tolerations and stay, which is what the node needs to
# go Ready again once it is repaired.
kubectl taint nodes "$NODE" "$TAINT:NoSchedule" --overwrite >/dev/null
kubectl taint nodes "$NODE" "$TAINT:NoExecute" --overwrite >/dev/null

# Bounded, and never fatal: on the warm path the taints are already there and
# nothing has to move, and on a re-seed of an already-broken node the kubelet
# cannot terminate anything anyway.
for _ in $(seq 1 15); do
  foreign=$(kubectl get pods -A --field-selector "spec.nodeName=$NODE" -o json 2>/dev/null \
    | jq --arg ns "$NS" '[ .items[]?
        | select(.metadata.deletionTimestamp == null)
        | select(.metadata.namespace != $ns)
        | select(.metadata.annotations["kubernetes.io/config.mirror"] == null)
        | select( any(.metadata.ownerReferences[]?.kind; . == "DaemonSet") | not ) ] | length' 2>/dev/null || true)
  [ "${foreign:-0}" -eq 0 ] && break
  sleep 2
done

# The break itself. setup.sh runs inside k8s-env as root, where `docker` talks
# to the inner dockerd that runs the kind nodes, so the node's own systemd is
# one exec away. A grader may not do this — a check reads the API — but seeding
# is not grading.
#
# DISABLE as well as stop. `systemctl stop` alone would be undone by the next
# `./sim down && ./sim up`: restarting the node container re-runs its systemd,
# which starts everything still linked into multi-user.target, and the question
# would quietly open solved on a resumed session. Disabling removes
# /etc/systemd/system/multi-user.target.wants/kubelet.service, and that is also
# the artifact the enablement criterion reads back through the probe Pod.
if ! command -v docker >/dev/null 2>&1; then
  echo "q07 setup: no docker client here — cannot reach $NODE's systemd" >&2
  exit 1
fi

for _ in 1 2 3; do
  docker exec "$NODE" systemctl disable --now kubelet >/dev/null 2>&1 && break
  sleep 3
done

enabled=$(docker exec "$NODE" systemctl is-enabled kubelet 2>/dev/null || true)
active=$(docker exec "$NODE" systemctl is-active kubelet 2>/dev/null || true)

# The Ready condition does not flip the moment the kubelet stops: the node
# controller waits out its monitor grace period first, about 45 s, and then sets
# Ready to Unknown rather than False. Returning before that would leave the
# question open with its first criterion still true, which is a free point on an
# untouched seed and an intermittent "fresh env should score 0".
ready=''
for _ in $(seq 1 40); do
  ready=$(kubectl get node "$NODE" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)
  [ "$ready" != "True" ] && break
  sleep 3
done

# Loud rather than quiet, and this is the one failure worth taking the prepare
# down for: a node that is still Ready two minutes after its kubelet was meant to
# be stopped means the seed did not happen, and the question would open already
# solved — ten free points, and a failed "fresh env should score 0" in smoke.
if [ "$ready" = "True" ]; then
  echo "q07 setup: $NODE still reports Ready (kubelet is-enabled='${enabled:-?}', is-active='${active:-?}') — the break did not take" >&2
  exit 1
fi

# kubectl apply restores every field this manifest names, but a field the
# candidate ADDED is in neither the previous last-applied-configuration nor this
# manifest, so a three-way merge keeps it. An affinity term, a second
# nodeSelector key or a hand-set nodeName — all of them plausible while chasing a
# Pending Pod — would survive the re-seed and move the probe off the node the
# question is about. Conditional, because the patch itself rolls the Deployment:
# on the untouched seed nothing is written and the apply below reports
# "unchanged".
drift=$(kubectl -n "$NS" get deploy "$DEP" -o json 2>/dev/null \
  | jq -r --arg node "$NODE" '.spec.template.spec
      | if .affinity != null or (.nodeName // "") != ""
           or (.nodeSelector // {}) != {"kubernetes.io/hostname": $node}
        then "yes" else "no" end' 2>/dev/null || true)
if [ "${drift:-no}" = "yes" ]; then
  kubectl -n "$NS" patch deploy "$DEP" --type=merge -p \
    '{"spec":{"template":{"spec":{"nodeSelector":null,"affinity":null,"nodeName":null,"tolerations":null}}}}' \
    >/dev/null 2>&1 || true
fi

# The probe is the question's instrument as well as its symptom.
#
#   * The hostname pin puts it on $NODE and nowhere else, so its Pod is Pending
#     for exactly one reason and the placement is the same on every run.
#   * The blanket toleration covers this question's two taints AND the
#     node.kubernetes.io/unreachable:NoSchedule + :NoExecute pair the node
#     controller adds once the kubelet stops answering. Without it the Pod could
#     not even be assigned to the broken node, and the candidate would have no
#     visible symptom beyond the node listing.
#   * The read-only hostPath on /etc/systemd/system is how "the unit is enabled"
#     becomes an API read: there is no node field for it, but a Pod that is
#     running on the node can be exec'd into, and the enablement symlink
#     multi-user.target.wants/kubelet.service either is there or is not. Starting
#     the unit without enabling it gets the node Ready and leaves that symlink
#     missing, which is the whole distinction this question is about.
#
# busybox:1.37 is preloaded into every node's containerd by bootstrap.sh, so the
# Pod starts without a registry the moment the kubelet is back.
kubectl -n "$NS" apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $DEP
  namespace: $NS
  labels: {app: $DEP}
spec:
  replicas: 1
  selector:
    matchLabels: {app: $DEP}
  template:
    metadata:
      labels: {app: $DEP}
    spec:
      terminationGracePeriodSeconds: 5
      nodeSelector:
        kubernetes.io/hostname: $NODE
      tolerations:
        - operator: Exists
      volumes:
        - name: host-units
          hostPath:
            path: /etc/systemd/system
            type: Directory
      containers:
        - name: probe
          image: busybox:1.37
          command: ["sh", "-c", "while :; do sleep 30; done"]
          volumeMounts:
            - name: host-units
              mountPath: /host-units
              readOnly: true
          resources:
            requests: {cpu: 10m, memory: 16Mi}
EOF

# A Pod's status is written by its node's kubelet, so killing the kubelet does
# not move a Running Pod to any other phase — it freezes the last status the
# kubelet ever wrote. Re-seeding a question the candidate had already solved
# would therefore leave a Pod reading Running on a node with nothing running on
# it, and the probe criterion would be true before anyone touched anything.
# --force --grace-period=0 drops the API object outright instead of waiting for
# a kubelet that will never confirm the delete; the ReplicaSet replaces it
# within the second, and the replacement is Pending, which is the honest seed.
# Scoped to this question's own namespace.
kubectl -n "$NS" delete pod --all --force --grace-period=0 --ignore-not-found >/dev/null 2>&1 || true

# Two things have to be true before this seed is finished, and the second is the
# one the fresh-environment rule rests on: the probe must be assigned to the
# broken node, and it must not be Running anywhere. The drift patch above rolls
# the Deployment, and a rollout can leave a Pod from the outgoing ReplicaSet
# alive on a healthy worker for a few seconds — grading a seed caught in that
# window would award the probe criterion for work nobody did. Bounded, and never
# fatal: every criterion reads the API rather than this wait.
for _ in $(seq 1 20); do
  seeded=$(kubectl -n "$NS" get pod -l "app=$DEP" -o json 2>/dev/null \
    | jq -c '[ .items[]? | select(.metadata.deletionTimestamp == null)
               | {node: (.spec.nodeName // ""), phase: (.status.phase // "")} ]' 2>/dev/null || true)
  here=$(printf '%s' "${seeded:-[]}" \
    | jq -r --arg n "$NODE" '[ .[]? | select(.node == $n) ] | length' 2>/dev/null || true)
  running=$(printf '%s' "${seeded:-[]}" \
    | jq -r '[ .[]? | select(.phase == "Running") ] | length' 2>/dev/null || true)
  [ "${here:-0}" -ge 1 ] && [ "${running:-1}" -eq 0 ] && break
  sleep 3
done
