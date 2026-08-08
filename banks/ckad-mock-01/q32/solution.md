# Solution 32

The whole task is one command:

```bash
k -n sagitta rollout restart deploy/session-store
k -n sagitta rollout status deploy/session-store
# deployment "session-store" successfully rolled out
```

Three new Pod names, three new ReplicaSet-backed Pods, and a Deployment
spec that still asks for exactly what it asked for before.

## How it does it without changing anything

There is no "restart" verb in the Kubernetes API. `kubectl` fakes one by
writing a timestamp into the Pod template:

```bash
k -n sagitta get deploy session-store \
  -o jsonpath='{.spec.template.metadata.annotations}'
# {"kubectl.kubernetes.io/restartedAt":"2026-02-11T09:14:03Z"}
```

That annotation is part of `spec.template`, so changing it is a Pod
template change, so the Deployment controller does what it always does
with one: it creates a new ReplicaSet and moves the Pods across under
`spec.strategy`. The image, the replica count and every other field are
untouched — nothing about the workload has changed, only the timestamp
that identifies this generation of it.

Two consequences follow:

- **It is a rolling update**, so it respects `maxSurge` and
  `maxUnavailable`, it shows up in `kubectl rollout status`, and it can
  be watched and rolled back like any other.
- **It is idempotent to re-run.** A second restart writes a new
  timestamp, which is a new template, which is a new rollout.

## Why not just delete the Pods

```bash
k -n sagitta delete pod -l app=session-store       # DO NOT
```

The ReplicaSet notices the shortfall and replaces them, so the end state
looks similar and the route there is worse:

- All three go at once. `maxUnavailable` does not apply, because no
  rollout is happening — the ReplicaSet is only refilling to its replica
  count, and there is a window with no Pod serving at all.
- Nothing records it. There is no new revision, no `rollout status` to
  watch and nothing in the history to say the workload was cycled.
- There is nothing to roll back to.

Deleting one Pod at a time and waiting is a hand-cranked rolling update
that still leaves no record.

## Why not touch the image

Setting the tag to something else and back is two rollouts to achieve one
restart, and in between, every Pod is running a version nobody chose.
Scaling to zero and back up is a full outage. Both change the spec the
question said to leave alone.

## Reading a ConfigMap without a restart

This task exists because the containers read their configuration once, at
start-up, which is true of `envFrom` and of environment variables
generally: the values are copied into the container at creation and
nothing updates them afterwards. A restart is the only way to pick up the
new ones.

A ConfigMap mounted as a **volume** behaves differently — the kubelet
refreshes the files in place within about a minute, and an application
that re-reads them needs no restart at all. Which of the two you chose
when you wrote the manifest decides whether config changes cost you a
rollout for the life of the workload.
