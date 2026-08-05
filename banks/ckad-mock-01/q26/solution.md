# Solution 26

Two fields, at two different levels. `imagePullPolicy` belongs to each
container; `terminationGracePeriodSeconds` belongs to the Pod.

```bash
k -n volans edit deploy edge-cache
```

```yaml
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 45
      containers:
        - name: cache
          image: nginx:1.29-alpine
          imagePullPolicy: Never
        - name: refresher
          image: busybox:1.37
          imagePullPolicy: Never
```

Or without an editor:

```bash
k -n volans patch deploy edge-cache -p '{
  "spec": {"template": {"spec": {
    "terminationGracePeriodSeconds": 45,
    "containers": [
      {"name": "cache", "imagePullPolicy": "Never"},
      {"name": "refresher", "imagePullPolicy": "Never"}
    ]
  }}}
}'

k -n volans rollout status deploy/edge-cache --timeout=180s
```

**Leave `--type` off**, which is the trap worth meeting once. With no
`--type`, `kubectl patch` sends a *strategic* merge patch, and Kubernetes
declares `name` as the merge key for `containers`: the entries above are
matched by name and merged into the existing ones, so naming a container
and giving only the field you are changing is enough.

Add `--type=merge` and it is an RFC 7386 JSON merge patch instead, where
a list is a single value and is **replaced wholesale**. The same body
then means "the Pod has two containers, each with a name and a pull
policy and no image", and the API server rejects it:

```
The Deployment "edge-cache" is invalid:
* spec.template.spec.containers[0].image: Required value
```

which is at least a loud failure. The quiet version of the same mistake
is a list where every container you did not mention is simply gone.

## The three pull policies

| Value | The kubelet |
|---|---|
| `Always` | Contacts the registry every time a container starts, to check the digest behind the tag |
| `IfNotPresent` | Uses the local copy if there is one, pulls if there is not |
| `Never` | Uses the local copy or fails the container with `ErrImageNeverPull` |

`Never` is the only one of the three that guarantees no registry traffic,
which is what an air-gapped node needs. `IfNotPresent` looks close enough
and is not: the first time an image is missing — a new node, a garbage
collected image store — it goes to the network.

The default is not "none". Leave the field out and the API server writes
one for you, chosen by the tag: `Always` for `:latest` or no tag at all,
`IfNotPresent` for anything else. So the value already stored on an
untouched container here is `IfNotPresent`, written by the server, and
indistinguishable from having typed it yourself.

```bash
k -n volans get deploy edge-cache \
  -o jsonpath='{range .spec.template.spec.containers[*]}{.name}{"\t"}{.imagePullPolicy}{"\n"}{end}'
```

## Why the policy is per container and the grace period is not

A Pod's containers each have their own image, so each needs its own
answer about fetching it — there is no Pod-level `imagePullPolicy` to
set once, and looking for one is the usual way to lose time here.

Shutdown is the opposite. When a Pod is deleted, the kubelet sends
`SIGTERM` to **every** container at once and starts one clock. When it
expires, whatever is still alive gets `SIGKILL`. There is one clock
because there is one Pod, and `terminationGracePeriodSeconds` is it.

Worth knowing about that clock: it starts at the same moment the Pod is
removed from its Service's endpoints, and those two things race — the
endpoint removal has to propagate to every node's kube-proxy while the
application is already shutting down. A `preStop` hook that sleeps a few
seconds before the process begins to exit is the usual fix, and its sleep
comes out of this same budget rather than being added to it.
