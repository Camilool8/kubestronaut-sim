# Solution 21

Two containers, one volume, and the whole point is that `app` is
untouched — it keeps writing its own private format and knows nothing
about the adapter.

```bash
k -n pictor apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: telemetry
  namespace: pictor
spec:
  volumes:
    - name: telemetry
      emptyDir: {}
  containers:
    - name: app
      image: busybox:1.37
      command:
        - sh
        - -c
        - while true; do echo 'cpu=42;mem=71' > /var/run/telemetry/raw.log; sleep 2; done
      volumeMounts:
        - name: telemetry
          mountPath: /var/run/telemetry
    - name: adapter
      image: busybox:1.37
      command:
        - sh
        - -c
        - while true; do tr ';' '\n' < /var/run/telemetry/raw.log | tr '=' ' ' > /var/run/telemetry/metrics.prom; sleep 2; done
      volumeMounts:
        - name: telemetry
          mountPath: /var/run/telemetry
EOF

k -n pictor wait --for=condition=Ready pod/telemetry --timeout=120s
k -n pictor exec telemetry -c adapter -- cat /var/run/telemetry/metrics.prom
# cpu 42
# mem 71
```

## Writing the command in YAML

The list form above avoids the quoting fight. Written inline as
`command: ["sh", "-c", "..."]`, the `'cpu=42;mem=71'` quotes and the
`\n` inside `tr ';' '\n'` have to survive both YAML and the shell, and
getting it wrong produces a container that starts and silently does
nothing.

If the adapter is running but `metrics.prom` is empty, check `raw.log`
first — from the adapter's side:

```bash
k -n pictor exec telemetry -c adapter -- ls -l /var/run/telemetry
k -n pictor exec telemetry -c adapter -- cat /var/run/telemetry/raw.log
```

If `raw.log` is missing there but present in `app`, the two containers
are not sharing the volume: usually one mount path is wrong, or one
container is missing its `volumeMounts` entry entirely. The volume is
declared once at Pod level and mounted separately by each container —
declaring it is not mounting it.

## Adapter vs sidecar

They are the same mechanics — an extra container in the Pod — and
different intent:

| Pattern | Does what |
|---|---|
| **Sidecar** | Adds a capability the app lacks: ships its logs, refreshes a certificate, proxies its mesh traffic |
| **Adapter** | Changes how the app *presents itself* to the outside, so the outside sees a standard interface |
| **Ambassador** | Changes how the app *reaches* the outside, so the app sees a simple local interface |

The adapter is what you reach for when you cannot change the application
— a vendor binary, a legacy service, something whose build you do not
own. Its rewritten output is the contract everything downstream depends
on, so the app's own format is free to stay strange.
