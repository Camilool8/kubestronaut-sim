# Solution 17

Start with the overview. The `STATUS` column names both problems:

```bash
k -n corvus get pod
# NAME                        READY   STATUS             RESTARTS
# cache-worker                0/1     CrashLoopBackOff   4 (30s ago)
# frontend-7c9f8d6b4-x2knq    1/1     Running            0
# mailer-5d7b9c884-t9wsn      0/1     ImagePullBackOff   0
```

Two different failures, and they need two different tools.

**1. The crash loop:**

```bash
echo cache-worker > /opt/course/17/crashing-pod
```

**2. Its logs.** The container has already exited and been replaced, so
plain `logs` shows the *current* attempt — often empty, or a fresh copy
of the same thing mid-flight. `--previous` reads the run that died:

```bash
k -n corvus logs cache-worker --previous > /opt/course/17/crash.log
cat /opt/course/17/crash.log
# FATAL: cache directory /var/cache/corvus is unavailable
```

Short forms: `-p` for `--previous`, and `--tail=20` when a log is long.

If it answers `unable to retrieve container logs for containerd://…`
instead, the container it wants has already been garbage-collected as the
crash loop churns. That message goes to **stdout with a zero exit**, so a
redirect captures it as though it were the log — check what you saved.
Try again in a few seconds, or drop `--previous`: for a Pod sitting in
backoff, the current logs are the last dead container's anyway.

**3. The image pull.** `logs` is useless here — no container ever
started, so there is nothing to log. `describe` carries the reason, in
the events at the bottom:

```bash
k -n corvus describe pod -l app=mailer | tail -8
#   Warning  Failed  ...  Failed to pull image "nginx:0.0.0-corvus-nonexistent":
#                         ... manifest unknown
```

Read the image straight off the spec rather than transcribing it from
the event text:

```bash
k -n corvus get deploy mailer \
  -o jsonpath='{.spec.template.spec.containers[0].image}' > /opt/course/17/bad-image

k -n corvus set image deploy/mailer mailer=nginx:1.29-alpine
k -n corvus rollout status deploy mailer
```

## Matching the tool to the symptom

| Status | What happened | Where the answer is |
|---|---|---|
| `CrashLoopBackOff` | Container started, then exited | `logs --previous` |
| `ImagePullBackOff` / `ErrImagePull` | No container was ever created | `describe pod` events |
| `CreateContainerConfigError` | A ConfigMap or Secret reference does not resolve | `describe pod` events |
| `Pending` | Nothing scheduled it | `describe pod` events — usually resources or a PVC |
| `Running` but not ready | Readiness probe failing | `describe pod`, then `logs` |

The rule of thumb: **if a container ever ran, use `logs`; if it never
did, use `describe`.** Reaching for `logs` on a Pod that never started is
the most common way to spend five minutes learning nothing.

## When you need a shell the image does not have

`cache-worker` runs busybox, so `k exec` would work — but plenty of
images ship without a shell at all, and a crash-looping container cannot
be `exec`'d into regardless. `kubectl debug` attaches an ephemeral
container with its own tools into the *running* Pod's namespaces:

```bash
k -n corvus debug -it cache-worker --image=busybox:1.37 --target=worker
```

It cannot help once the Pod is in backoff — nothing is running to join —
but for a Pod that is up and misbehaving it beats rebuilding the image
with a debugger in it.
