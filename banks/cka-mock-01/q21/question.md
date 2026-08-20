Namespace `octans` runs two Deployments, `batch-runner` and `web-frontend`.
Both are currently pinned to node `sim-worker` by a
`kubernetes.io/hostname` nodeSelector, left behind by a cluster rebuild.
Node `sim-worker2` is being dedicated to batch work.

1. Reserve node `sim-worker2` for batch workloads:
   - taint it with key `workload`, value `batch`, effect `NoSchedule`
   - label it `workload=batch`

   No other node may carry that taint or that label.

2. Change Deployment `batch-runner` so that its Pods:
   - tolerate the taint you just added,
   - are **required** to run on nodes labelled `workload=batch` — a
     scheduling preference is not enough,
   - no longer name a node: the `kubernetes.io/hostname` pin must go.

   Keep both replicas, and finish with **both** `batch-runner` Pods
   running on `sim-worker2`.

3. Leave Deployment `web-frontend` alone. It must still exist, and none of
   its Pods may end up on `sim-worker2`.

```bash
k get nodes
k -n octans get pod -o wide
```
