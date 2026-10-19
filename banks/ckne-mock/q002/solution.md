**kube-controller-manager** is correct: The `kube-controller-manager` (via the NodeIPAM controller) splits the `--cluster-cidr` into subnets and assigns a `spec.podCIDR` to each node. Some CNIs (e.g., Calico with its own IPAM, Cilium cluster-pool) ignore this field and use their own IPAM.

Why the others are wrong:

- **kubelet** — the kubelet consumes `spec.podCIDR` (it passes it to the CNI) but never assigns it — it has no view of the cluster-wide range to carve from.
- **kube-scheduler at pod bind time** — the scheduler places pods on nodes and knows nothing about address ranges; binding a pod never touches a node's CIDR.
- **kube-proxy in IPVS mode** — kube-proxy programs Service rules (iptables or IPVS); it neither allocates addresses nor writes to Node objects.
