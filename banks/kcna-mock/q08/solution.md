**DaemonSet** is correct: a DaemonSet ensures that all (or a selected subset of) nodes run one copy of a given Pod. When a new node joins the cluster, the DaemonSet controller automatically adds the Pod to it, and when a node is removed its Pod is garbage collected. This makes DaemonSets the standard choice for per-node infrastructure such as monitoring agents, log collectors, and node networking components.

Why the others are wrong:

- **Deployment** — a Deployment runs a fixed number of replicas placed wherever the scheduler chooses; it neither guarantees one Pod per node nor reacts to new nodes joining.
- **StatefulSet** — a StatefulSet gives replicas stable identities and per-replica storage for stateful applications; it has no concept of covering every node.
- **Job** — a Job runs Pods until a task completes and then stops; a monitoring agent needs to run continuously on each node, not run to completion.
