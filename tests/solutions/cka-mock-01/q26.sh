#!/usr/bin/env bash
set -euo pipefail

# Runs on the question's instance as candidate. Every step that touches etcd
# happens on the aux-etcd node, because a restore takes the API server down with
# it and `kubectl exec` would be gone exactly when it was needed.
#
# StrictHostKeyChecking/UserKnownHostsFile: this node is deleted and rebuilt on
# the same alias and port whenever the question is re-seeded, so a remembered
# host key would refuse a correct answer.
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no
     -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR cka-aux-etcd)

AUX="$HOME/.kube/aux-etcd"
NS=q26-fleet
CM=fleet-registry
SERIAL=7f3c9a21d4e8
SNAP=/opt/backup/etcd-before-restore.db
# The node aux_up builds for this question, and with it the name the kubelet
# gives the etcd static Pod's mirror: <component>-<node>. Used as an address,
# never asserted on.
NODE=aux-etcd-control-plane

kaux() { kubectl --kubeconfig "$AUX" --request-timeout=10s "$@"; }

# The seed runs the whole drawn exam's setups in sequence; make sure this one's
# cluster is actually up before driving it.
#
# Health is an ordinary API call, never /readyz: after a restore the API server
# serves reads and writes for about a minute while /readyz still answers 500
# with "etcd-readiness failed", so waiting on readiness would wait past a
# cluster that is already working.
up=''
for _ in $(seq 1 30); do
  if kaux get ns kube-system -o jsonpath='{.metadata.name}' >/dev/null 2>&1; then up=1; break; fi
  sleep 5
done
[ -n "$up" ] || { echo "aux-etcd is not serving before the work starts" >&2; exit 1; }

# 1. The pre-restore snapshot, from the running etcd, with the certificates the
#    static pod's own flags name.
"${SSH[@]}" 'bash -s' <<'EOS'
set -e
export PATH=/usr/local/bin:$PATH
mkdir -p /opt/backup
rm -f /opt/backup/etcd-before-restore.db
etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /opt/backup/etcd-before-restore.db
etcdutl -w json snapshot status /opt/backup/etcd-before-restore.db
EOS

# 2. Restore into a directory that does not exist yet — etcdutl refuses an
#    existing one, and a re-run of this script must not trip over the directory
#    the last run made — then move the etcd-data volume's HOST path onto it.
#    The mountPath and --data-dir describe the path inside the container and are
#    left alone. The kubelet picks the change up by itself.
#
#    The output is captured rather than printed straight through: the directory
#    is named on the node, from the node's clock, and the convergence wait below
#    has to know which one it got.
repoint=$("${SSH[@]}" 'bash -s' <<'EOS'
set -e
export PATH=/usr/local/bin:$PATH
manifest=/etc/kubernetes/manifests/etcd.yaml
new=/var/lib/etcd-restore-$(date +%s)

etcdutl snapshot restore /opt/backup/etcd-nightly.db --data-dir "$new"
test -d "$new/member"

# `path:` is not a unique key in this manifest. The livenessProbe's httpGet has
# one too — `path: /livez` — and it sits ABOVE the volumes block, so a plain
# grep for path: with head -1 finds the probe, not the volume: the edit then
# rewrites the health check, leaves etcd on the original data directory, and the
# symptom is an etcd that restarts in a loop while the restore looks like it did
# not take. volumes: is the last block in the file, so both the read and the
# write are scoped to it with a sed range (kind nodes ship no yq).
volume_paths() { sed -n '/^  volumes:/,$p' "$manifest" | grep -E '^ *path:' | awk '{print $2}'; }
data_dir() { volume_paths | grep -v '^/etc/kubernetes/pki/etcd$' | head -1; }
above_volumes() { sed -n '1,/^  volumes:/p' "$manifest"; }

cur=$(data_dir)
[ -n "$cur" ] || { echo "no etcd-data hostPath found in $manifest" >&2; exit 1; }

before=$(above_volumes)
cp "$manifest" /opt/backup/etcd.yaml.bak
sed -i "/^  volumes:/,\$ s#path: ${cur}#path: ${new}#" "$manifest"

# Verify the STATE, not the string. "the new path appears somewhere in the file"
# is true even when it was written onto the wrong line, which is precisely how
# this went wrong once — the assertion has to name the field it meant.
got=$(data_dir)
[ "$got" = "$new" ] || { echo "etcd-data hostPath is '$got', expected '$new'" >&2; exit 1; }
[ "$(above_volumes)" = "$before" ] \
  || { echo "the edit changed something above the volumes block in $manifest" >&2; exit 1; }
above_volumes | grep -q 'path: /livez' \
  || { echo "the livenessProbe path is no longer /livez in $manifest" >&2; exit 1; }
echo "etcd-data repointed: ${cur} -> ${new}"
EOS
)
printf '%s\n' "$repoint"
NEWDIR=$(printf '%s\n' "$repoint" | sed -n 's/^etcd-data repointed: .* -> //p')
[ -n "$NEWDIR" ] || { echo "the repoint step did not name a new data directory" >&2; exit 1; }

# 3. Wait for the cluster to finish moving — BOTH halves, and in this order,
#    before anything else is done to it.
#
#    Both reads ask for ONE NAMED object, which on this cluster is a
#    correctness requirement and not a style choice: see step 4. Measured at
#    59 s from the repoint on one run and about four minutes on another,
#    depending on how long the kubelet takes to notice the manifest; the mirror
#    Pod follows roughly 70 s behind the etcd it describes.
ok=''
serial=''
mirrored=''
for _ in $(seq 1 72); do
  serial=$(kaux -n "$NS" get cm "$CM" -o jsonpath='{.data.serial}' 2>/dev/null || true)
  mirrored=$(kaux -n kube-system get pod "etcd-${NODE}" \
    -o jsonpath='{.spec.volumes[?(@.name=="etcd-data")].hostPath.path}' 2>/dev/null || true)
  if [ "$serial" = "$SERIAL" ] && [ "$mirrored" = "$NEWDIR" ]; then ok=1; break; fi
  sleep 5
done

# The verdict first, in one line, then the dump. The dump is what diagnoses a
# failure, but a log that opens with a crictl table makes the reader hunt for
# what was actually wrong. This stops here rather than carrying on into step 4:
# restarting the API server of a cluster that has not settled is how the mirror
# Pod is lost for good, which is the whole point of the note below.
[ -n "$ok" ] || {
  echo "aux-etcd did not converge on the restore" >&2
  echo "  expected: ${NS}/${CM} readable with serial=${SERIAL}, etcd Pod on ${NEWDIR}" >&2
  echo "  found:    serial='${serial}', etcd-data='${mirrored}' after 360s of polling" >&2
  echo "-- Namespaces:" >&2
  kaux get ns >&2 || true
  echo "-- ConfigMaps in ${NS}:" >&2
  kaux -n "$NS" get cm >&2 || true
  echo "-- etcd-data hostPath the etcd Pod is running from (asked for by name; a" >&2
  echo "   label selector is a list and a list can still be the pre-restore cache):" >&2
  kaux -n kube-system get pod "etcd-${NODE}" \
    -o jsonpath='{.spec.volumes[?(@.name=="etcd-data")].hostPath.path}{"\n"}' >&2 || true
  echo "-- on the node:" >&2
  "${SSH[@]}" 'crictl ps -a | head -20; ls -d /var/lib/etcd*' >&2 || true
  exit 1
}

# 4. Clear the API server's cache, which the restore has just invalidated.
#
#    A restore moves etcd's revision BACKWARDS. The API server's watch cache
#    decides whether it is current by comparing revisions, so a cache built
#    before the restore concludes it is already ahead of etcd and goes on
#    serving what it held — indefinitely, for as long as that process runs.
#    LIST is answered from that cache and GET of a named object is not, which
#    is why 'get cm' can list nothing on a cluster where 'get cm fleet-registry'
#    returns the object, and why the mirror Pod of the etcd static Pod can keep
#    reporting the directory it was replaced from. Observed here: the kubelet
#    recreated that Pod 73 s after the repoint and a label selector never saw it.
#
#    Restarting the API server is the repair, and it is part of finishing a
#    restore rather than a workaround: every controller that lists is reading
#    the same stale cache until it happens. Removing the container is enough —
#    the kubelet starts a new one from the same static manifest within seconds.
#
#    ORDER MATTERS, and getting it wrong costs the mirror Pod entirely. The
#    kubelet replaces that Pod in two steps: it deletes the one the snapshot put
#    back, then creates one describing the manifest as it now reads. An API
#    server that disappears between those two calls leaves the create failing
#    with 'unexpected EOF' — and the kubelet does not try again, because its own
#    record still names the UID it just deleted. The Pod is then simply absent,
#    the criterion that reads it cannot pass, and only 'systemctl restart
#    kubelet' brings it back. Observed here, from a restart fired one second
#    into that window. Step 3 has already waited for the replacement, so by this
#    line there is nothing left in flight.
"${SSH[@]}" 'bash -s' <<'EOS'
set -e
export PATH=/usr/local/bin:$PATH
id=$(crictl ps --name kube-apiserver -q | head -1)
[ -n "$id" ] || { echo "no running kube-apiserver container on the node" >&2; exit 1; }
crictl rm -f "$id" >/dev/null
echo "kube-apiserver container removed — the kubelet starts a new one with an empty cache"
EOS

# 5. The cache is empty now, so an ordinary list finally agrees with the reads
#    above. This is confirmation rather than a second wait: nothing is graded on
#    it, and the cluster is already in the state the checks read.
listed=''
for _ in $(seq 1 36); do
  listed=$(kaux -n "$NS" get cm -o jsonpath="{.items[?(@.metadata.name=='${CM}')].metadata.name}" 2>/dev/null || true)
  [ "$listed" = "$CM" ] && break
  sleep 5
done

[ "$listed" = "$CM" ] || {
  echo "warning: ${NS}/${CM} is readable by name but a list still does not show it," >&2
  echo "         so the API server did not come back with an empty cache. The graded" >&2
  echo "         state is correct either way; the cluster is not fully coherent." >&2
}

# The other half of the score is a file on the node, so confirm it the same way
# the check does rather than assuming step 1 left something usable.
"${SSH[@]}" "/usr/local/bin/etcdutl -w json snapshot status $SNAP" >/dev/null || {
  echo "$SNAP is not a valid etcd snapshot" >&2
  exit 1
}
