**It attaches pods to the network and assigns them IP addresses when they are created** is correct: when the kubelet sets up a pod's sandbox, it invokes the configured CNI plugin, which wires the pod's network interface into the cluster network and allocates the pod its IP address. Plugins such as Cilium, Calico, and Flannel implement this interface, and many also add extras like NetworkPolicy enforcement.

Why the others are wrong:

- **It load-balances external HTTP traffic to Services** — routing external HTTP traffic is handled by an Ingress controller or a Gateway API implementation, not by the CNI plugin.
- **It encrypts Secrets stored in etcd** — encryption at rest for Secrets is a kube-apiserver/etcd configuration concern and has nothing to do with pod networking.
- **It resolves Service names to IP addresses inside the cluster** — in-cluster name resolution is provided by the cluster DNS service (typically CoreDNS), which is a separate component from the CNI plugin.
