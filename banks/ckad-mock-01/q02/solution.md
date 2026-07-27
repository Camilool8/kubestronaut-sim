# Solution 2

```bash
k -n nova get deploy nova-api -o jsonpath='{.spec.template.spec.containers[0].image}' > /opt/course/2/old-image
k -n nova edit deploy nova-api
```

In the editor: set image `nginx:1.29-alpine`, `replicas: 3`, add under the
container:

```yaml
readinessProbe:
  httpGet: {path: /, port: 80}
  initialDelaySeconds: 5
  periodSeconds: 10
```

and under `spec.strategy`:

```yaml
rollingUpdate: {maxSurge: 1, maxUnavailable: 0}
```

Then watch it come up:

```bash
k -n nova rollout status deploy nova-api
```

## When rollout status lies to you

If you reach this question well into the exam, that command may answer
immediately with:

```
error: deployment "nova-api" exceeded its progress deadline
```

**Your fix is probably fine.** `rollout status` reports the Deployment's
*current* `Progressing` condition, and this Deployment has been failing
to pull `nginx:1.99` since the cluster started. After ten minutes of
that, Kubernetes sets `ProgressDeadlineExceeded` — and the condition is
still there the moment you patch it, so `rollout status` sees a stale
failure and exits non-zero before your new ReplicaSet has had a chance
to report anything.

Look at what is actually true instead:

```bash
k -n nova get deploy nova-api
# NAME       READY   UP-TO-DATE   AVAILABLE
# nova-api   3/3     3            3

k -n nova get deploy nova-api -o jsonpath='{range .status.conditions[*]}{.type}={.reason}{"\n"}{end}'
# Available=MinimumReplicasAvailable
# Progressing=NewReplicaSetAvailable
```

Once the new ReplicaSet becomes available the condition flips to
`NewReplicaSetAvailable` and a second `rollout status` succeeds. The
lesson generalises: `rollout status` is a *report on a condition*, not a
live measurement, and on a Deployment that was already broken it will
tell you about the old failure first.
