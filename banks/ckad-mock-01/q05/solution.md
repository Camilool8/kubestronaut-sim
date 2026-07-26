# Solution 5

The one thing to get right: a **native sidecar is an init container with
`restartPolicy: Always`**, not a second entry under `containers`. That is
what buys you ordered startup (it runs before the main container) and
independent restarts, and it is why the question insists on it.

```bash
k -n lyra apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: feed-writer
  namespace: lyra
spec:
  replicas: 1
  selector:
    matchLabels: {app: feed-writer}
  template:
    metadata:
      labels: {app: feed-writer}
    spec:
      volumes:
        - name: feed-logs
          emptyDir: {}
      initContainers:
        # A plain init container: runs to completion, then the next one
        # starts. No restartPolicy here.
        - name: wait-for-source
          image: busybox:1.37
          command: ["sh", "-c", "until wget -q -O /dev/null http://feed-source; do sleep 2; done"]
        # The sidecar. restartPolicy: Always is the whole difference.
        - name: shipper
          image: busybox:1.37
          restartPolicy: Always
          command: ["sh", "-c", "tail -F /var/log/feed/app.log"]
          volumeMounts:
            - name: feed-logs
              mountPath: /var/log/feed
      containers:
        - name: writer
          image: busybox:1.37
          command: ["sh", "-c", "while true; do date >> /var/log/feed/app.log; sleep 2; done"]
          volumeMounts:
            - name: feed-logs
              mountPath: /var/log/feed
EOF
```

Watch it come up — you should see the init container finish, then the
sidecar and the main container run together:

```bash
k -n lyra rollout status deploy feed-writer
k -n lyra get pod -l app=feed-writer
```

Then capture the sidecar's output. `-c shipper` matters: without it
`kubectl logs` picks the first ordinary container, which is `writer`, and
`writer` prints nothing to stdout — it redirects into the file.

```bash
k -n lyra logs deploy/feed-writer -c shipper > /opt/course/5/shipper.log
cat /opt/course/5/shipper.log
```

`logs deploy/...` picks a live Pod from the current ReplicaSet. A label
selector plus `head -1` can hand you one that is still terminating from a
previous rollout, and you get `container "shipper" ... is waiting to
start: PodInitializing` instead of logs.

## Why not two ordinary containers?

You could put `shipper` under `containers` and the log-tailing would
work. Two things would not:

- **Startup order.** Ordinary containers start in parallel, so `shipper`
  can run `tail -F` before `writer` exists. (`-F` survives that, which is
  precisely why sloppy versions of this pattern appear to work.)
- **Shutdown order.** On termination a native sidecar is stopped *after*
  the main container, so it can ship the last lines. An ordinary
  container is not.

The init container is the other half of the pattern: it does its job once
and exits, and nothing else starts until it does. Give it a
`restartPolicy` and it stops being an init container and never finishes,
leaving the Pod stuck in `Init:0/2` forever.
