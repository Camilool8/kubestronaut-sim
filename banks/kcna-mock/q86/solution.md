**To divide a single cluster into multiple virtual, isolated scopes for organizing and separating resources between teams, environments, or applications** is correct: names within a Namespace must be unique, but the same name can be reused across different Namespaces, and RBAC rules, resource quotas, and network policies can all be scoped to one. This is what lets one physical cluster safely host, for example, separate `dev` and `staging` environments without their object names colliding.

Why the others are wrong:

- **To physically partition a cluster's nodes into separate hardware pools** — Namespaces are a purely logical, API-level grouping; they have no relationship to which physical nodes a Pod can run on (that is closer to what node selectors, taints, or separate node pools address).
- **To define which container runtime a Pod's containers use** — the container runtime is a node-level (and, for a mixed cluster, `RuntimeClass`) concern entirely independent of which Namespace a Pod's manifest lives in.
- **To encrypt Secrets so only Pods in the same Namespace can decrypt them** — Namespaces do provide a scoping boundary that RBAC can restrict Secret access around, but they perform no encryption themselves; encryption at rest is a separate etcd-level concern.
