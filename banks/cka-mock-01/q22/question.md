Namespace `reticulum` runs the checkout tier as the Deployment
`checkout-api`. Two PriorityClasses already exist for that Namespace's
workloads: `q22-bulk`, for background jobs, and `q22-standard`, which
`checkout-api` currently runs at. Checkout is being promoted above both.

1. Create a PriorityClass named `q22-critical`:

   | Setting | Requirement |
   |---|---|
   | Value | strictly **greater** than both `q22-bulk` and `q22-standard`, and no greater than `1000000000` |
   | Preemption | `preemptionPolicy: Never`, matching the two classes already here |
   | Global default | must **not** be set |

   The two existing values are not printed here on purpose —
   `kubectl get priorityclass` is where to read them. Stay under the
   ceiling: the `system-*` classes live above it and the cluster
   components using them have to keep outranking your workloads.

   `preemptionPolicy: Never` is what makes this a queueing decision
   rather than an eviction one — the Pods get scheduled ahead of
   lower-priority ones and never push a running Pod out. And a class
   marked `globalDefault: true` is applied to every Pod in the **whole
   cluster** that names no class at all, including workloads in
   Namespaces that are not yours to re-rank.

2. The promotion below is a rollout, and it must not cost any serving
   capacity. Set the Deployment's rolling update strategy to:

   | Field | Value |
   |---|---|
   | `maxSurge` | `2` |
   | `maxUnavailable` | `0` |

   Write both as absolute Pod counts, not percentages.

3. Make `checkout-api` run at the new class, and finish with the Pods it
   is actually running carrying it.

```bash
k get priorityclass
k -n reticulum get deploy checkout-api -o json | jq .spec.strategy
```
