# Solution 44

The listing says it is over, and the Pods say how it got there:

```bash
k -n eridanus get job
# NAME               STATUS   COMPLETIONS   DURATION   AGE
# ledger-reconcile   Failed   0/1           38s        4m

k -n eridanus get pod
# NAME                     READY   STATUS   RESTARTS   AGE
# ledger-reconcile-8bqzv   0/1     Error    0          4m
# ledger-reconcile-nk4tp   0/1     Error    0          3m
# ledger-reconcile-wr2c9   0/1     Error    0          3m
```

Three Pods, all `Error`, none of them restarted. That combination is the
signature of `restartPolicy: Never`: a failed container is never retried
inside its Pod, so each attempt is a whole new Pod and the dead ones stay
where they are.

## The reason

```bash
k -n eridanus describe job ledger-reconcile | grep -A3 Conditions
# Conditions:
#   Type    Status  Reason
#   ----    ------  ------
#   Failed  True    BackoffLimitExceeded
```

```bash
k -n eridanus get job ledger-reconcile \
  -o jsonpath='{.status.conditions[?(@.type=="Failed")].reason}' \
  > /opt/course/44/reason
cat /opt/course/44/reason
# BackoffLimitExceeded
```

## The container's own words

The Pods are still there, so their logs are still readable. Select them
all at once rather than naming one:

```bash
k -n eridanus logs -l batch.kubernetes.io/job-name=ledger-reconcile --tail=-1 \
  > /opt/course/44/failure.log
cat /opt/course/44/failure.log
# reconcile aborted: ledger checksum mismatch
# reconcile aborted: ledger checksum mismatch
# reconcile aborted: ledger checksum mismatch
```

`--tail=-1` is worth knowing: with a selector, `kubectl logs` tails only
the last 10 lines per Pod by default, and silently.

`kubectl logs job/ledger-reconcile` also works and picks one of the Pods.

## Replacing it

`spec.completions`, `spec.template` and `spec.backoffLimit` are all
immutable, so an edit gets you a wall of `field is immutable`. Delete and
create:

```bash
k -n eridanus delete job ledger-reconcile

k -n eridanus apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: ledger-reconcile
  namespace: eridanus
spec:
  completions: 4
  parallelism: 2
  backoffLimit: 4
  activeDeadlineSeconds: 120
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: reconcile
          image: busybox:1.37
          command: ["sh", "-c", "echo reconciled"]
EOF

k -n eridanus wait --for=condition=Complete job/ledger-reconcile --timeout=180s
k -n eridanus get job ledger-reconcile
# NAME               STATUS     COMPLETIONS   DURATION   AGE
# ledger-reconcile   Complete   4/4           9s         12s
```

Deleting the Job takes its Pods with it, which is why the log had to be
saved first.

## The four fields, and what each one actually stops

| Field | Default | Counts |
|---|---|---|
| `completions` | 1 | How many Pods must **succeed** before the Job is done |
| `parallelism` | 1 | How many Pods may be running at once |
| `backoffLimit` | 6 | How many **failures** are tolerated before the Job is failed |
| `activeDeadlineSeconds` | none | Wall-clock seconds from the Job starting |

`backoffLimit` is a count of failures, not of attempts, and the Job stops
when that count is *exceeded* — so a limit of 2 produces three failed
Pods, which is exactly what was sitting in this Namespace. Between
attempts the controller waits 10s, then 20s, then 40s, doubling to a
six-minute cap, which is why a Job that cannot succeed takes minutes to
admit it rather than seconds.

`activeDeadlineSeconds` is the other kind of give-up, and it **outranks**
`backoffLimit`: when the deadline passes, every running Pod is
terminated and the Job is failed with reason `DeadlineExceeded` however
many retries were still available. It is the field for work that is
worthless once it is late — a nightly reconciliation that must not still
be going when the morning batch starts.

## Never versus OnFailure

`restartPolicy` on a Job's Pod template takes only those two values;
`Always` is rejected, because a Pod that always restarts can never
complete.

| Value | On a failed container |
|---|---|
| `Never` | The Pod goes to `Failed` and stays. The Job creates a **new Pod** for the next attempt |
| `OnFailure` | The **same Pod** restarts the container in place, and its `RESTARTS` column climbs |

`Never` leaves you one Pod per attempt to read afterwards, which is the
better default when you expect to be debugging — it is why the failed
Job here still had three sets of logs to show. `OnFailure` is cheaper: no
new Pod, no rescheduling, no image lookup. The cost is that each restart
overwrites what the last container was doing, so `--previous` reaches
back exactly one attempt and no further.

Under `OnFailure`, container restarts also count towards `backoffLimit`
just as replaced Pods do — the limit is about failures, not about how the
failure was retried.
