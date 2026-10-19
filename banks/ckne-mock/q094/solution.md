**Same name/namespace + the service.cilium.io/global annotation** is correct: With the global annotation, Cilium merges the backends of all clusters into balancing. Extras: `service.cilium.io/affinity: local` prefers local-cluster endpoints, with automatic failover to remote ones if locals go down.

Why the others are wrong:

- **Expose via NodePort on all nodes** — NodePorts are per-cluster node addresses; nothing merges them into one balanced service across clusters.
- **Copy the ClusterIP manually** — each cluster allocates ClusterIPs from its own range; a copied address is meaningless in the other cluster's datapath.
- **Only via an Ingress shared between the clusters** — an Ingress routes north-south traffic; Cluster Mesh's global services handle east-west calls between pods without any ingress hop.
