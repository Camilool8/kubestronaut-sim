#!/usr/bin/env bash
# points: 2
# desc: a snapshot of the live cluster was saved to /opt/backup/etcd-before-restore.db on the aux-etcd node
# expected: none — the one criterion grades a measurement, the key count
#           etcdutl reads back out of the file, not a shape the candidate
#           authored. A real snapshot's own revision and key count are
#           moments taken off a live etcd and never repeat between runs, so
#           a captured reference would never match a correct answer's own
#           file. The message already names the count found.
set -uo pipefail
. /banks/_lib/checks.sh

SNAP=/opt/backup/etcd-before-restore.db
STAGED=/opt/backup/etcd-nightly.db

# This is the bank's ONE documented departure from API-only grading, and it is
# here because there is no API to ask: an etcd snapshot is a file on a node, and
# whether it is a real snapshot or a truncated copy of something else is a
# question only the file itself answers. Everything else this question grades is
# read from the aux cluster's API in the next check.
#
# The program below runs on the node and prints one JSON object, so a missing
# file, an unreadable one and an unreachable node all arrive here as the same
# shape rather than as three parse failures. etcd 3.6 moved the offline
# subcommands: `snapshot status` lives in etcdutl now and `etcdctl snapshot
# status` only prints its own help, so a status read that used the 3.5 spelling
# would report every correct answer as invalid. /usr/local/bin is put ahead of
# whatever the login shell inherits so this reads the staged binary and not
# something a candidate dropped earlier in their PATH.
REMOTE='
export PATH=/usr/local/bin:$PATH
saved=$(etcdutl -w json snapshot status /opt/backup/etcd-before-restore.db 2>/dev/null)
staged=$(etcdutl -w json snapshot status /opt/backup/etcd-nightly.db 2>/dev/null)
printf "{\"saved\":%s,\"staged\":%s}\n" "${saved:-null}" "${staged:-null}"
'

# The login is by key, port and hostname rather than by the cka-aux-etcd alias:
# that alias lives in the candidate's own ~/.ssh/config, and a check runs as
# root. Reading a file out of another user's home to grade with — or trusting a
# table they are free to edit — is not a thing a grader should depend on.
# UserKnownHostsFile=/dev/null because this node is deleted and rebuilt on the
# same port whenever the question is re-seeded, and a remembered host key must
# never be able to fail a correct answer. timeout outside, ConnectTimeout
# inside: both well under the 30s a check gets, so an unreachable node costs
# evidence rather than a timed-out check scored FAILED.
out=$(timeout 20 ssh -i /shared/ssh/id_ed25519 -p 2214 -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR root@k8s-env "$REMOTE" 2>/dev/null) # lint: allow-node-read

saved=$(printf '%s' "${out:-}" | jq -c '.saved' 2>/dev/null)
staged=$(printf '%s' "${out:-}" | jq -c '.staged' 2>/dev/null)

evidence() {
  show_actual json "$(printf '{"%s": %s, "%s": %s}' \
    "$SNAP" "${saved:-null}" "$STAGED" "${staged:-null}")"
  show_why "$1"
}

# Nothing came back at all: the node is not there, or not answering. That is a
# different failure from "the file is not a snapshot" and says so, because the
# repair is different — this one is about the cluster being gone, not about the
# backup.
[ -n "$saved" ] || {
  echo "the aux-etcd node did not answer, so nothing on its disk could be read"
  evidence "Both files read as null above because the node itself could not be reached — no answer came back from it at all, so this says nothing yet about the file you were asked to write. The node comes up with its cluster: if 'kubectl --kubeconfig ~/.kube/aux-etcd get ns' also fails, the cluster is down or was deleted, and re-seeding this question (Training mode) builds it again. Both paths this check reads are on that node, never on the machine you are typing on."
  exit 1
}

# totalKey is etcdutl's count of keys in the snapshot. A number greater than
# zero is the one thing that separates a real snapshot of a running cluster
# from an empty file, a truncated copy or a text file with the right name:
# etcdutl refuses all three ("Error: invalid database") and prints nothing here.
keys=$(printf '%s' "${saved:-null}" | jq -r '.totalKey // empty' 2>/dev/null)
revision=$(printf '%s' "${saved:-null}" | jq -r '.revision // empty' 2>/dev/null)

is_snapshot() {
  case ${keys:-} in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$keys" -gt 0 ]
}

if [ "${saved:-null}" = null ]; then
  msg="nothing readable at ${SNAP} — no file there, or not an etcd snapshot"
else
  msg="${SNAP} holds ${keys:-0} key(s) at revision ${revision:-?}, want a snapshot with keys in it"
fi

crit 2 "a valid etcd snapshot is saved at ${SNAP}" "$msg" \
  "A snapshot is taken from a RUNNING etcd, over its client port, with the certificates that etcd accepts — it is the one part of this task that has to happen before the restore, because afterwards the state you would have been saving is gone. On this cluster that is 'etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key snapshot save ${SNAP}', run on the node. Two things commonly land here instead. Without the three certificate flags etcd refuses the connection and the file is never created; and on etcd 3.6 'etcdctl snapshot status' no longer exists, so a check of your own work with that spelling prints the help text and tells you nothing — 'etcdutl -w json snapshot status ${SNAP}' is the one that reads the file. The staged backup's own line in the pane above is what a healthy answer looks like." \
  -- is_snapshot

crit_all_passed || evidence "$(crit_why)"
report "the pre-restore snapshot is a real one"
