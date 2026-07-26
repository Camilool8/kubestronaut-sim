# Solution 16

All three probes go on the container, inside the Pod template:

```bash
k -n hydra edit deploy orders-api
```

```yaml
      containers:
        - name: api
          image: nginx:1.29-alpine
          ports:
            - containerPort: 80
          startupProbe:
            httpGet: {path: /, port: 80}
            periodSeconds: 2
            failureThreshold: 30
          readinessProbe:
            httpGet: {path: /, port: 80}
            periodSeconds: 5
            failureThreshold: 2
          livenessProbe:
            httpGet: {path: /, port: 80}
            initialDelaySeconds: 10
            periodSeconds: 10
```

```bash
k -n hydra rollout status deploy orders-api
k -n hydra get endpointslice -l kubernetes.io/service-name=orders-api
```

If you cannot remember the field names — and there is no reason to —
`explain` is faster than searching the docs:

```bash
k explain deploy.spec.template.spec.containers.readinessProbe
k explain deploy.spec.template.spec.containers.readinessProbe.httpGet
```

## What each probe is for

| Probe | On failure | Use it for |
|---|---|---|
| **startup** | kills the container | Slow starts. While it runs, the other two are suspended. |
| **readiness** | removes the Pod from Services | "Can I take traffic *right now*" — a full queue, a lost dependency |
| **liveness** | kills the container | "Am I wedged and only a restart will help" |

The pairing that matters here is **readiness and Services**. A Pod
failing readiness stays `Running` but is pulled out of the Service's
endpoints, so traffic stops going to it without anything being killed.
That is why the check counts ready endpoints and not just running Pods —
probes that are present but misconfigured leave two healthy-looking Pods
serving nothing.

## startupProbe's budget

`failureThreshold: 30` with `periodSeconds: 2` allows 60 seconds to
start. Get this wrong and the container is killed mid-boot, restarts, and
is killed again — a crash loop whose cause is not in the logs, because
the application never did anything wrong.

The classic mistake it exists to fix is a liveness probe with a generous
`initialDelaySeconds` used to cover a slow start. That delay applies on
*every* restart and does nothing about an app whose startup time varies.
A startupProbe handles the boot, then hands over.

## Liveness that only points at itself

`httpGet: /` against the app's own web server is fine for this exercise
and weak in production: it proves the HTTP listener is up, which is the
one thing that is usually still true when an app is wedged. A liveness
probe worth having exercises something that actually breaks — and must
never check a *dependency*, or an outage in the database will restart
every application Pod that talks to it.
