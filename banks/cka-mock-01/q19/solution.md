# Solution 19

## The symptom

```bash
k -n volans logs deploy/orders-api -c api
#
```

Nothing. The container is not broken and it is not quiet — it appends a
line a second to a file:

```bash
k -n volans exec deploy/orders-api -c api -- tail -2 /var/log/orders/app.log
# 2026-08-19T11:04:12Z orders-api seq=418 order accepted
# 2026-08-19T11:04:13Z orders-api seq=419 order accepted
```

A container log is that container's stdout and stderr and nothing else, so
a file written inside the container is invisible to `kubectl logs`, to
anything scraping the node's log directory, and to everything downstream
of those. The fix that does not require touching the application is a
second container in the same Pod that reads the file and writes it to its
own stdout.

## The edit

Everything happens in one Pod template. Open it:

```bash
k -n volans edit deploy orders-api
```

```yaml
    spec:
      volumes:                      # 1. declared once, at Pod level
        - name: orders-logs
          emptyDir: {}
      initContainers:               # 2. the sidecar, in the init list
        - name: shipper
          image: busybox:1.37
          restartPolicy: Always     #    <- the whole difference
          command: ["sh", "-c", "tail -F /var/log/orders/app.log"]
          volumeMounts:
            - name: orders-logs
              mountPath: /var/log/orders
      containers:
        - name: api
          image: busybox:1.37
          command: ["/bin/sh", "-c"]
          args:
            - |
              ...unchanged...
          volumeMounts:             # 3. the writer needs a mount too
            - name: orders-logs
              mountPath: /var/log/orders
```

Then watch it roll:

```bash
k -n volans rollout status deploy/orders-api
# deployment "orders-api" successfully rolled out

k -n volans get pod -l app=orders-api
# NAME                          READY   STATUS    RESTARTS   AGE
# orders-api-7f9c6d4b58-9tqrn   2/2     Running   0          25s
```

`2/2`, on a Deployment whose `containers` list still has one entry. A
running native sidecar is counted in `READY` alongside the application
container, which is one of the quickest ways to see that the
`restartPolicy` took effect.

```bash
k -n volans logs deploy/orders-api -c shipper --tail=3
# 2026-08-19T11:12:40Z orders-api seq=7 order accepted
# 2026-08-19T11:12:41Z orders-api seq=8 order accepted
# 2026-08-19T11:12:42Z orders-api seq=9 order accepted
```

## Doing it without the editor

A strategic merge patch matches each list by name, so this adds the
sidecar and the volume and appends a mount to the container that is
already there, all in one call:

```bash
k -n volans patch deploy orders-api --type=strategic -p '{
  "spec": {"template": {"spec": {
    "volumes": [{"name": "orders-logs", "emptyDir": {}}],
    "initContainers": [{
      "name": "shipper",
      "image": "busybox:1.37",
      "restartPolicy": "Always",
      "command": ["sh", "-c", "tail -F /var/log/orders/app.log"],
      "volumeMounts": [{"name": "orders-logs", "mountPath": "/var/log/orders"}]
    }],
    "containers": [{
      "name": "api",
      "volumeMounts": [{"name": "orders-logs", "mountPath": "/var/log/orders"}]
    }]
  }}}
}'
```

## Why the sidecar goes in `initContainers`

It reads as a contradiction the first time — a container that is not an
init container, declared in the init container list — so it is worth
being precise about what the API actually does with it.

| Where it is declared | `restartPolicy` on the entry | What the kubelet does |
|---|---|---|
| `containers` | not a field there | Starts it in parallel with the others; the Pod's own `restartPolicy` decides what happens when it exits |
| `initContainers` | absent | Runs it to completion, in list order, before any of the `containers` start |
| `initContainers` | `Always` | Starts it before the `containers`, does not wait for it to finish, restarts it on its own if it dies, and stops it after the `containers` have stopped |

That third row is the native sidecar, and it exists because the first two
rows both fail a log shipper. As an ordinary container it starts at the
same time as the application, so the first lines can be written before
anything is watching, and it is stopped at the same time, so the last
lines can be lost. As a plain init container it never gets past the
starting line at all: init containers must exit, `tail -F` never exits,
and the Pod sits in `Init:0/1` forever.

```bash
k -n volans get pod -l app=orders-api
# NAME                          READY   STATUS     RESTARTS   AGE
# orders-api-6d5b7c9f84-x2klp   0/1     Init:0/1   0          90s
```

That is the failure to recognise if you forget the one field.

## Why `-F` and not `-f`

The sidecar starts *before* the application container, which means
`/var/log/orders/app.log` does not exist yet when `tail` runs. `tail -f`
on a missing file prints an error and exits; the kubelet restarts the
container, it exits again, and you get a `CrashLoopBackOff` that looks
like a broken image. `tail -F` retries until the file appears and follows
it across rotation and replacement.

The same forgiveness is a trap in the other direction: `-F` also retries
forever when the path is wrong. A sidecar mounted at `/var/log/order` or
watching its own empty `emptyDir` because the writer was never given a
mount will sit there `Running`, healthy, and completely silent. If the
log is empty, compare the two `volumeMounts` before you touch anything
else:

```bash
k -n volans get deploy orders-api \
  -o jsonpath='{range .spec.template.spec.initContainers[*]}{.name}{" "}{.volumeMounts}{"\n"}{end}{range .spec.template.spec.containers[*]}{.name}{" "}{.volumeMounts}{"\n"}{end}'
# shipper [{"mountPath":"/var/log/orders","name":"orders-logs"}]
# api [{"mountPath":"/var/log/orders","name":"orders-logs"}]
```

## What `emptyDir` is doing here

It is scratch space created when the Pod is scheduled, shared by every
container in that Pod, and deleted with the Pod. That last part is the
right trade for a log being shipped somewhere else: the file only has to
survive long enough for the sidecar to read it. It is also why mounting
it over `/var/log/orders` costs the application nothing — the directory
was already private to the container, and now it is private to the Pod
instead.
