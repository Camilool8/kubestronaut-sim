# Solution 43

The symptom is in the listing, and it is the `RESTARTS` column rather
than the status:

```bash
k -n horologium get pod
# NAME                             READY   STATUS    RESTARTS      AGE
# session-store-6c9f8d5b7c-2xk4m   1/1     Running   4 (21s ago)   2m
# session-store-6c9f8d5b7c-r7ptn   1/1     Running   4 (18s ago)   2m
```

`Running` and `1/1`, restarting every twenty seconds or so. The container
is not exiting — something is stopping it. The log says nothing useful,
because there is nothing wrong with the application:

```bash
k -n horologium logs session-store-6c9f8d5b7c-2xk4m --previous
# ... /docker-entrypoint.sh: Configuration complete; ready for start up
```

The events name the killer:

```bash
k -n horologium describe pod -l app=session-store | tail -8
# Events:
#   Type     Reason     Age                 From     Message
#   ----     ------     ----                ----     -------
#   Warning  Unhealthy  25s (x8 over 2m)    kubelet  Liveness probe failed: Get
#     "http://10.244.1.9:8080/": dial tcp 10.244.1.9:8080: connect: connection refused
#   Normal   Killing    25s (x4 over 2m)    kubelet  Container store failed liveness
#     probe, will be restarted
```

Save that while it still exists:

```bash
k -n horologium describe pod -l app=session-store > /opt/course/43/evidence
```

`connection refused` on `8080`, from the kubelet, against the Pod's own
address. Now look at what the container actually opens:

```bash
k -n horologium get deploy session-store \
  -o jsonpath='{.spec.template.spec.containers[*].ports[*].containerPort}'
# 80
```

Port `80` in the container, port `8080` in the probe.

## The fix

The probe is part of the Pod template, so it is edited on the Deployment:

```bash
k -n horologium edit deploy session-store
```

```yaml
          livenessProbe:
            httpGet:
              path: /
              port: 80        # was 8080
            initialDelaySeconds: 5
            periodSeconds: 3
            failureThreshold: 2
```

or as a patch, which is exact and does not open an editor:

```bash
k -n horologium patch deploy session-store -p '{
  "spec": {"template": {"spec": {"containers": [
    {"name": "store", "livenessProbe": {"httpGet": {"path": "/", "port": 80}}}
  ]}}}
}'
```

Editing the template starts a rollout, so the restarts do not "stop" —
the Pods that were accumulating them are replaced by new ones that start
at zero:

```bash
k -n horologium rollout status deploy/session-store --timeout=180s
k -n horologium get pod
# NAME                             READY   STATUS    RESTARTS   AGE
# session-store-7d4b9c6f88-4tqvz   1/1     Running   0          32s
# session-store-7d4b9c6f88-lm6hs   1/1     Running   0          30s
```

## Deleting the probe is not fixing it

It makes the restarts stop, and it is the wrong answer for a reason
worth stating plainly: a liveness probe is what turns a wedged process
into a restarted one without anybody being paged. Removing it leaves a
container that Kubernetes believes is healthy for as long as its PID 1 is
alive — which a deadlocked server, an exhausted thread pool and a process
stuck on a lost connection all are.

The check here therefore looks for a probe that is present *and* correct.

## Reading a probe failure

The three things the event tells you, in the order they narrow it down:

| In the message | Means |
|---|---|
| `Liveness probe failed` | Which probe. `Readiness probe failed` never restarts anything; it removes the Pod from its Services |
| `Get "http://10.244.1.9:8080/"` | Where it went. The IP is the **Pod's**, never a Service's — the kubelet probes the container directly on the node |
| `connection refused` | Nothing is bound to that port. Compare with a `404`, which means something answered and the *path* is wrong, and with a timeout, which means the process is alive and stuck |

Those three failures need three different fixes, and the message is what
separates them without any guessing.

## The two clocks around a liveness probe

The settings that were deliberately left alone here are the ones that
decide how forgiving the probe is:

| Field | Default | What it buys |
|---|---|---|
| `initialDelaySeconds` | 0 | Time before the first check, for a container that boots slowly |
| `periodSeconds` | 10 | Gap between checks |
| `failureThreshold` | 3 | Consecutive failures before the container is killed |
| `timeoutSeconds` | 1 | How long one check may take before it counts as failed |

A liveness probe that is too aggressive is its own outage: a container
that is merely slow to start gets killed mid-boot, restarts, is slow
again, and never converges. `startupProbe` exists exactly for that —
while it is running the liveness probe is suspended entirely, so a slow
boot and a hung process can have separate budgets instead of one shared
compromise.
