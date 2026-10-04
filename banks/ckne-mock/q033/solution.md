**Unique, non-overlapping PodCIDRs and ClusterIDs, plus direct connectivity between the clusters' nodes** is correct: Cluster Mesh requires non-overlapping pod CIDRs, unique `cluster.id`/`cluster.name`, and mutual node reachability. With that you get global service discovery, cross-cluster balancing and policies across clusters.

Why the others are wrong:

- **A single etcd shared across clusters** — each cluster keeps its own etcd; Cluster Mesh synchronises state through per-cluster `clustermesh-apiserver` endpoints, not a shared store.
- **All clusters in the same availability zone** — clusters can span zones, regions and clouds; what matters is reachability between nodes, not physical proximity.
- **The exact same kernel version on all nodes** — kernel versions may differ within Cilium's supported range; identity is an agent-level contract, not a kernel one.
