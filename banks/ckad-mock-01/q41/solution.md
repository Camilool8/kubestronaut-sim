# Solution 41

Start with the listing. `Pending` with `0/1` containers ready and an age
that keeps growing is the shape to recognise:

```bash
k -n columba get pod
# NAME              READY   STATUS    RESTARTS   AGE
# archive-indexer   0/1     Pending   0          3m
# price-feed        1/1     Running   0          3m
# report-cache      1/1     Running   0          3m
```

```bash
echo archive-indexer > /opt/course/41/pod-name
```

There is nothing to read in the logs, and saying so is worth doing once:

```bash
k -n columba logs archive-indexer
# Error from server (BadRequest): container "indexer" in pod "archive-indexer" is
# waiting to start: ContainerCreating
```

No container ever started, so there is no log stream. The scheduler
records its verdict as an event on the Pod instead:

```bash
k -n columba describe pod archive-indexer | tail -6
# Events:
#   Type     Reason            Age   From               Message
#   ----     ------            ----  ----               -------
#   Warning  FailedScheduling  3m    default-scheduler  0/2 nodes are available:
#     2 Insufficient memory. preemption: 0/2 nodes are available: 2 No preemption
#     victims found for incoming pod.
```

Save it exactly as it came out:

```bash
k -n columba get events \
  --field-selector involvedObject.name=archive-indexer \
  -o jsonpath='{range .items[*]}{.reason}{": "}{.message}{"\n"}{end}' \
  > /opt/course/41/reason
```

`Insufficient memory` is the whole answer. Confirm it against the
arithmetic the scheduler was doing:

```bash
k -n columba get pod archive-indexer \
  -o jsonpath='{.spec.containers[*].resources.requests}'
# {"memory":"900Gi"}
```

## Replacing the Pod

`resources` is immutable on a running Pod, so an edit is refused:

```bash
k -n columba edit pod archive-indexer
# error: pods "archive-indexer" was not valid:
# spec: Forbidden: pod updates may not change fields other than ...
```

Take the object, change the one field, and replace it:

```bash
k -n columba get pod archive-indexer -o yaml > /tmp/indexer.yaml
vim /tmp/indexer.yaml     # memory: 900Gi -> memory: 64Mi
k -n columba replace --force -f /tmp/indexer.yaml
```

`--force` deletes the existing object and creates the file's version in
its place. Writing it out by hand is just as good:

```bash
k -n columba delete pod archive-indexer
k -n columba apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: archive-indexer
  namespace: columba
  labels: {app: archive-indexer}
spec:
  containers:
    - name: indexer
      image: busybox:1.37
      command: ["sh", "-c", "sleep 86400"]
      resources:
        requests:
          memory: 64Mi
EOF
k -n columba get pod archive-indexer -w
```

## Why the events and not the logs

The three places a Pod can be stuck each leave their trace somewhere
else, and reaching for the wrong one wastes most of the time this
question is worth:

| Stuck at | Status | Where the reason is |
|---|---|---|
| Scheduling | `Pending` | Events on the Pod, from `default-scheduler` |
| Fetching the image | `ImagePullBackOff` | Events on the Pod, from `kubelet` |
| Running | `CrashLoopBackOff` | The container's log, including the previous one |

The first two have no container, so no log stream exists and `kubectl
logs` can only tell you that. Only the third has anything to read.

## What the scheduler was comparing

Scheduling is arithmetic over `requests`, never over `limits` and never
over what a Pod is really using:

- A node's allocatable capacity is its capacity minus what the kubelet
  and the system reserve.
- From that, the scheduler subtracts the sum of the **requests** of every
  Pod already assigned to the node — whether or not those Pods are using
  any of it.
- A Pod fits only if every one of its requests still fits in what is
  left.

So a Pod requesting more memory than any single node has can never be
scheduled, no matter how idle the cluster is, and it stays `Pending`
forever rather than failing. `0/2 nodes are available` counts every node
in the cluster and then says, per node, which predicate rejected it —
`Insufficient memory` here, and typically `untolerated taint` for the
control-plane node.

Requests are also what the QoS class is derived from, which is what
decides the eviction order under memory pressure: a container with equal
requests and limits is `Guaranteed`, one with requests below its limits
is `Burstable`, and one with neither is `BestEffort` and dies first.
