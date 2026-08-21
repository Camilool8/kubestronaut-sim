#!/usr/bin/env bash
# points: 3
# desc: fleet-registry is back in Namespace q26-fleet on aux-etcd, restored from the snapshot under a new data directory
# expected: configmap.json json
set -uo pipefail
. /banks/_lib/checks.sh

AUX=/home/candidate/.kube/aux-etcd
NS=q26-fleet
CM=fleet-registry
REGION=eu-west-3
SERIAL=7f3c9a21d4e8
SEEDED_DIR=/var/lib/etcd
# The etcd static Pod's mirror, addressed by name rather than found by label —
# see the read below for why a LIST cannot be trusted on this cluster. Neither
# half of the name is guesswork: the kubelet names a mirror Pod
# <component>-<node>, and the node is the one aux_up builds for this question.
NODE=aux-etcd-control-plane
ETCD_POD="etcd-${NODE}"

# Every read here goes to the aux cluster's API, from this instance, with a
# request timeout: the cluster may be mid-restore, wrecked, or deleted
# altogether, and a check that waits on a dead API server spends its whole 30s
# budget and is scored FAILED rather than reporting what it found. The
# kubeconfig is a symlink into /shared that only comes alive when this question
# is seeded.
kaux() { kubectl --kubeconfig "$AUX" --request-timeout=5s "$@"; }

# Do-no-harm, so a gate rather than a criterion: a serving cluster is what the
# untouched seed already has, and scoring it would hand out points for work
# nobody did. It is also the honest place to stop — with the API down, the
# ConfigMap below cannot be read at all, and "not found" would be the wrong
# thing to tell someone whose cluster never came back.
#
# Health is proved by an ordinary API operation and deliberately NOT by /readyz:
# for a minute or so after a correct restore the API server serves reads and
# writes perfectly well while /readyz still answers 500 with
# "etcd-readiness failed", so a readiness gate would score a finished answer
# zero. Listing Namespaces asks the same question honestly — it goes to etcd and
# comes back.
nss=$(kaux get ns -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>&1)
has_name "$nss" kube-system || {
  echo "the aux-etcd API server did not answer, so the restore cannot be judged"
  show_actual text "${nss:-}"
  show_why "The pane holds what kubectl said when it was asked to list the Namespaces of the aux cluster. The API server depends on etcd, so an etcd that did not come back takes the whole cluster with it — expected DURING the restore, a fault once you are finished. Work through it from the node: 'crictl ps -a | head' shows whether the etcd container is starting and dying and 'crictl logs' on it names the reason. The two commonest are a data directory the restore never wrote (etcdutl refuses to restore into a directory that already exists, so the Pod ends up pointed at an empty one) and an edit that left the manifest's indentation unparseable, in which case the kubelet never starts the Pod at all. Give it a minute after the manifest change before concluding anything: the API server backs off between attempts to reach etcd."
  exit 1
}

# Both reads below fetch ONE named object, and on this question that is a
# correctness requirement rather than a style choice.
#
# Restoring a snapshot moves etcd's revision BACKWARDS. The API server's watch
# cache compares revisions to decide whether it is current, so a cache built
# before the restore concludes it is already ahead and keeps serving what it
# held — for as long as that API server runs. LIST is answered from that cache;
# a GET of a named object is answered from etcd. So on a correctly restored
# cluster, 'get cm' can list nothing while 'get cm fleet-registry' returns the
# object, and 'get pod -l component=etcd' can report the pre-restore mirror Pod
# for minutes after the kubelet has replaced it. Measured on this cluster: the
# mirror Pod was recreated 73s after the repoint and a label selector never saw
# it. Whether the cache ever corrects itself depends on whether the API server
# happens to restart while etcd is away, which is not something a score may
# turn on.
cm=$(kaux -n "$NS" get cm "$CM" -o json 2>/dev/null \
  | jq -c '{name: (.metadata.name // null), data: (.data // {})}' 2>/dev/null)
cms=$(kaux -n "$NS" get cm -o json 2>/dev/null \
  | jq -c '[ .items[]? | .metadata.name ]' 2>/dev/null)

# The static Pod the kubelet mirrors into the API. Its etcd-data volume names
# the directory ON THE NODE that etcd is running from, which is the one part of
# the repoint that is visible without logging in anywhere. The name is an
# address, never a criterion: nothing here grades what the Pod is called.
etcd=$(kaux -n kube-system get pod "$ETCD_POD" -o json 2>/dev/null | jq -c '
  [ . | {pod: .metadata.name,
         dataDir: ([ .spec.volumes[]? | select(.name == "etcd-data")
                     | .hostPath.path ] | join(",")) } ]' 2>/dev/null)

# Only the ConfigMap's own name and data get a generated document — the
# restore either brought back this exact object or it did not, and that is
# a shape a solved cluster reproduces byte for byte. Whether the etcd Pod
# has been repointed to the restored data directory is a live reading of a
# different object, and its verdict is already carried by that criterion's
# own message below; a second pane here would collide with this one in the
# UI, which shows one actual/expected pair per check, not per criterion.
snapshot() {
  printf '%s' "${cm:-null}" | jq -S '{name: (.name // null), data: (.data // {})}' 2>/dev/null
}

evidence() {
  show_pair json configmap.json
  show_why "$1"
}

name=$(printf '%s' "${cm:-null}" | jq -r '.name // ""' 2>/dev/null)
region=$(printf '%s' "${cm:-null}" | jq -r '.data.region // ""' 2>/dev/null)
serial=$(printf '%s' "${cm:-null}" | jq -r '.data.serial // ""' 2>/dev/null)
datadir=$(printf '%s' "${etcd:-[]}" | jq -r 'first(.[]? | .dataDir) // ""' 2>/dev/null)

# Existence and contents are one criterion because the restore either brought
# the object back or it did not: an object of the right name carrying different
# data was typed out by hand, which is the one route this question rules out.
if [ -z "$name" ]; then
  cm_msg="no ConfigMap named ${CM} in Namespace ${NS} (a LIST of that Namespace's ConfigMaps, which a restore can leave stale, returns: ${cms:-[]})"
else
  cm_msg="${CM} exists but holds region='${region}', serial='${serial}'"
fi

restored() {
  [ "$name" = "$CM" ] && [ "$region" = "$REGION" ] && [ "$serial" = "$SERIAL" ]
}

crit 2 "${CM} is back in ${NS} with the data it held" "$cm_msg" \
  "The ConfigMap was deleted from the live cluster, so no amount of work against the API brings it back — the only copy of its data is inside /opt/backup/etcd-nightly.db, and getting at it means putting that snapshot back under the cluster. On the node: 'etcdutl snapshot restore /opt/backup/etcd-nightly.db --data-dir <a directory that does not exist yet>', then point the etcd static Pod at that directory. The API server reconnects to the new etcd by itself and the ConfigMap is there when it does; its age comes from the snapshot rather than from now, because it is not a new object. An empty or half-filled object under the right name is one that was re-created by hand instead of restored. One warning about checking your own work: ask for the object by name. 'kubectl -n ${NS} get cm' can come back listing nothing at all on a cluster that restored perfectly, because a list is answered from the API server's cache and a restore rewinds etcd underneath it; 'kubectl -n ${NS} get cm ${CM}' goes to etcd and tells you the truth. Restarting the API server — move its manifest out of /etc/kubernetes/manifests and back — clears the cache and makes the two agree." \
  -- restored

if [ -z "$datadir" ]; then
  dir_msg="no Pod named ${ETCD_POD} is in kube-system, so the directory etcd runs from cannot be read"
else
  dir_msg="etcd is running from ${datadir} on the node, which is the directory it was already using"
fi

repointed() {
  [ -n "$datadir" ] && [ "$datadir" != "$SEEDED_DIR" ]
}

crit 1 "the etcd Pod runs from the restored data directory" "$dir_msg" \
  "A restore writes a fresh member directory; it does not touch the one etcd is using, and until something points etcd at the new files nothing has changed for the cluster. That pointer is the hostPath of the volume named etcd-data in /etc/kubernetes/manifests/etcd.yaml — the HOST side of the mount. Leave --data-dir and the volumeMounts entry alone: those are the path inside the container, which stays /var/lib/etcd. The kubelet watches that directory and recreates the Pod on its own, so there is nothing to apply and nothing to restart — measured at about 70s from the edit to the replacement Pod, so give it that long before reading anything into it. This criterion reads the mirror of that Pod in the API, asked for by name, so it can tell a repointed etcd from one still serving ${SEEDED_DIR}, where the deleted object never was. Ask for it the same way — 'kubectl --kubeconfig ~/.kube/aux-etcd -n kube-system describe pod ${ETCD_POD}' — because a label selector is a list, and a list on a freshly restored cluster is answered from a cache that still describes the Pod you replaced. If that Pod is missing entirely, the containers on the node are fine and only its record is gone: the kubelet replaces that record with a delete and then a create, and an API server restarted between those two calls leaves the create failed and unretried. 'systemctl restart kubelet' on the node writes it again." \
  -- repointed

crit_all_passed || evidence "$(crit_why)"
report "${CM} is back, restored from the snapshot"
