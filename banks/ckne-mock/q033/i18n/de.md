## Question

Was ist in Cilium Cluster Mesh die grundlegende Netzwerkanforderung zwischen den verbundenen Clustern?

## Options

- Ein einziges, geteiltes etcd
- Eindeutige PodCIDRs und ClusterIDs
- Alle Cluster in derselben Availability Zone
- Exakt dieselbe Kernel-Version auf allen Nodes

## Solution

**Eindeutige PodCIDRs und ClusterIDs** ist die richtige Antwort: Cluster Mesh verlangt nicht überlappende Pod-CIDRs, eindeutige `cluster.id`/`cluster.name` und gegenseitige Node-Erreichbarkeit. Dann gibt es globale Service-Discovery, Cluster-übergreifendes Balancing und Policies.
