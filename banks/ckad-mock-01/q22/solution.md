# Solution 22

Look at the configuration you have been given first — it tells you which
port the app should be talking to:

```bash
k -n dorado get cm ambassador-conf -o jsonpath='{.data.default\.conf}'
# server { listen 8080; location / { proxy_pass http://payments-backend...; } }
```

Then the Pod. Note what is *not* in the `app` container: no environment
variable, no volume, nothing naming the backend at all.

```bash
k -n dorado apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: checkout
  namespace: dorado
spec:
  volumes:
    - name: conf
      configMap:
        name: ambassador-conf
  containers:
    - name: app
      image: busybox:1.37
      command: ["sh", "-c", "sleep 3600"]
    - name: ambassador
      image: nginx:1.29-alpine
      volumeMounts:
        - name: conf
          mountPath: /etc/nginx/conf.d
EOF

k -n dorado wait --for=condition=Ready pod/checkout --timeout=120s
k -n dorado exec checkout -c app -- wget -qO- http://localhost:8080
# backend-ok
```

## Why localhost works

Containers in a Pod **share a network namespace**. They see the same
loopback interface and the same set of ports, which is why `app` can
reach a listener that belongs to `ambassador` at `127.0.0.1:8080` with no
Service, no DNS and no configuration.

The same sharing is why two containers in one Pod cannot both bind port
8080 — the second one gets "address already in use", exactly as two
processes on one machine would.

## What the pattern buys

The application's outbound configuration is permanently `localhost:8080`.
Everything that can change — the backend's Service name, its namespace,
whether it is sharded, whether it needs TLS or retries or a circuit
breaker — moves into the ambassador, and the app is never rebuilt or
reconfigured for any of it.

That is why the check refuses an `app` container that mentions
`payments-backend`. Passing the Service name in as an environment
variable would still make the `wget` succeed, and would have given the
application exactly the knowledge the pattern exists to take away from
it.

This is the idea a service mesh generalises: the sidecar proxies inject
into every Pod are ambassadors, applied to all traffic rather than one
dependency.

## When it does not answer

```bash
k -n dorado logs checkout -c ambassador
k -n dorado exec checkout -c ambassador -- cat /etc/nginx/conf.d/default.conf
```

An empty or default config almost always means the mount path is wrong.
nginx reads every `.conf` under `/etc/nginx/conf.d`, so mounting one
directory higher (`/etc/nginx`) replaces `nginx.conf` itself and the
server never starts.
