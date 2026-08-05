# Solution 25

`kubectl debug` adds a container to a Pod that is already running. It
does not restart anything, it does not go through the Deployment or the
ReplicaSet, and it does not need the application image to contain a
single diagnostic tool.

```bash
k -n perseus debug ledger-api --image=busybox:1.37 -c debugger --target=api --profile=general -- sleep 3600
```

That returns immediately, having added the container. Now work from it:

```bash
k -n perseus exec ledger-api -c debugger -- \
  wget -q -O - http://127.0.0.1:8080/healthz > /opt/course/25/healthz

k -n perseus exec ledger-api -c debugger -- ps > /opt/course/25/api-process
```

```bash
cat /opt/course/25/healthz
# ledger-api ok build 4471
cat /opt/course/25/api-process
# PID   USER     TIME  COMMAND
#     1 root      0:00 nginx: master process nginx -g daemon off;
#    ...
```

Interactively you would normally write it as one command and look around
by hand:

```bash
k -n perseus debug ledger-api -it --image=busybox:1.37 -c debugger --target=api --profile=general -- sh
```

The `-- sleep 3600` form above exists so the container is still running
when the next `exec` arrives — an ephemeral container whose command has
exited cannot be `exec`'d into, exactly like any other container.

## What each flag buys

| Flag | Effect |
|---|---|
| `--image` | The image the new container runs. This is the whole point: bring the tools rather than baking them into production images |
| `-c` / `--container` | Names it. Left out, kubectl invents something like `debugger-8kx2t` |
| `--target` | Joins that container's **process namespace** |
| `-it` | Attach a terminal, for interactive use |

Without `--target`, the ephemeral container still shares the Pod's
**network** namespace — which is why the `wget` above reaches a listener
bound to `127.0.0.1` — but it gets a process namespace of its own, so
`ps` shows one process: itself. With `--target`, `/proc` is the target
container's `/proc`, and you can read its command line, its environment
and its open file descriptors.

## Why loopback matters here

`127.0.0.1` is not one address. Inside `ledger-api` it is that Pod's own
loopback interface; on the instance it is the instance. A Service cannot
help, because the listener is not bound to the Pod's address at all — an
EndpointSlice would point at an address nginx is not accepting
connections on, and every request would be refused.

Binding an admin or health endpoint to loopback is a common and
deliberate production choice, and this is how you reach it: from inside
the same network namespace.

## Ephemeral containers are permanent

Once added, the entry stays in `spec.ephemeralContainers` forever. There
is no `kubectl debug --remove`, and deleting one is not a supported
update — the container stops when its command exits, but the record of it
does not go away.

```bash
k -n perseus get pod ledger-api -o jsonpath='{.spec.ephemeralContainers}' | jq .
```

They also have deliberate limitations: no ports, no readiness or liveness
probes, no resource requests, and no way to add a volume mount after the
fact. They exist to look, not to run anything the Pod depends on.

## When the container will not start at all

If the Pod's own container is crash-looping, `kubectl exec` refuses it —
you cannot exec into a container that is not running — and an ephemeral
container targeting it has nothing to share. The tool for that case is a
copy rather than an attachment:

```bash
k -n perseus debug ledger-api -it --copy-to=ledger-api-debug --container=api -- sh
```

which builds a new Pod from the same spec with the command replaced, and
leaves the original untouched for whatever else you still want to read
off it.
