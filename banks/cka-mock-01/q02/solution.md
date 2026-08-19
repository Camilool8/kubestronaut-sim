# Solution 2

Start with the status, which names the failure mode:

```bash
k -n lyra get pod
# NAME                            READY   STATUS             RESTARTS
# payments-api-6c8f9b7d4-2xq7t    0/1     CrashLoopBackOff   5 (54s ago)
```

`CrashLoopBackOff` means the container **ran**. Something started, exited
non-zero, and the kubelet is restarting it with a growing delay. That is
the branch where logs are the tool — `describe` carries the reason only
when no container was ever created.

```bash
k -n lyra logs deploy/payments-api --previous
# FATAL: DB_ENDPOINT is empty - payments-api has no database endpoint to connect to
```

`--previous` reads the run that already died. Plain `logs` on a Pod in
backoff usually shows the same thing — the last dead container's output
is what the kubelet still has — but as soon as a new attempt is running
it shows that one instead, and on a fast crash loop that is often empty.
If the answer comes back as `unable to retrieve container logs for
containerd://…`, the container has been garbage-collected; wait a few
seconds and ask again.

Now find out where the variable was supposed to come from:

```bash
k -n lyra get deploy payments-api \
  -o jsonpath='{.spec.template.spec.containers[*].env}' | jq
# [
#   { "name": "LOG_LEVEL",   "valueFrom": { "configMapKeyRef": { "name": "payments-config", "key": "LOG_LEVEL" } } },
#   { "name": "DB_ENDPOINT", "valueFrom": { "configMapKeyRef": { "name": "payments-config", "key": "db-endpoint", "optional": true } } }
# ]

k -n lyra get cm payments-config -o jsonpath='{.data}' | jq
# { "DB_ENDPOINT": "postgres.lyra.svc.cluster.local:5432", "LOG_LEVEL": "info" }
```

The ConfigMap holds `DB_ENDPOINT`. The Deployment asks for `db-endpoint`,
which is not a key it has. `LOG_LEVEL` beside it is wired correctly and
is the shape to copy.

## Why this crashed instead of failing to start

A `configMapKeyRef` whose key is missing normally stops the container
before it runs: the Pod sits in `CreateContainerConfigError` and
`describe` says which key could not be found. This one carries
`optional: true`, which tells the kubelet to carry on and leave the
variable unset — so the container starts, the process finds nothing in
`$DB_ENDPOINT`, and it exits by design.

That is worth recognising on sight, because the two symptoms send you to
different tools:

| Status | What happened | Where the answer is |
|---|---|---|
| `CrashLoopBackOff` | The container ran and exited | `logs --previous` |
| `CreateContainerConfigError` | A ConfigMap or Secret key did not resolve | `describe pod` |
| `ImagePullBackOff` | No container was ever created | `describe pod` events |
| `Pending` | Nothing scheduled it | `describe pod` events |

## The fix

Point the reference at the key that exists:

```bash
k -n lyra edit deploy payments-api
# under the DB_ENDPOINT env entry: key: db-endpoint  ->  key: DB_ENDPOINT
```

or without an editor:

```bash
k -n lyra patch deploy payments-api --type=strategic -p '{"spec":{"template":{"spec":{"containers":[{"name":"api","env":[{"name":"DB_ENDPOINT","valueFrom":{"configMapKeyRef":{"name":"payments-config","key":"DB_ENDPOINT"}}}]}]}}}}'
```

The strategic merge matches the container by `name` and the env entry by
its `name`, so it rewrites that one variable and leaves `LOG_LEVEL`
alone. Editing the Pod template rolls a new ReplicaSet out by itself:

```bash
k -n lyra rollout status deploy payments-api
k -n lyra exec deploy/payments-api -- printenv DB_ENDPOINT
# postgres.lyra.svc.cluster.local:5432
```

The other accepted repair is to give the ConfigMap the key the Deployment
is asking for:

```bash
k -n lyra patch cm payments-config \
  -p '{"data":{"db-endpoint":"postgres.lyra.svc.cluster.local:5432"}}'
k -n lyra rollout restart deploy payments-api
```

Environment variables are resolved when a container starts, not while it
runs, so a Pod that is already up never picks up an edited ConfigMap this
way — the restart is what makes it take. A crash-looping Pod would get
there on its own eventually, but its backoff is up to five minutes by
then, and waiting for it is not a use of exam time.

Both repairs keep the endpoint in the ConfigMap, which is the point.
Pasting `postgres.lyra.svc.cluster.local:5432` into the template as a
literal `value:` would also start the container, and it would score the
running Deployment but not the wiring: the value would now live in two
places, and the ConfigMap would no longer be the one that decides it.
