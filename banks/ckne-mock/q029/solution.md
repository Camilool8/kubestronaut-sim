**MetalLB — L2 mode (ARP/NDP) or BGP mode** is correct: MetalLB allocates IPs from a pool and announces them: in **L2**, one node answers ARP for the VIP; in **BGP**, nodes announce the VIP to the routers, with ECMP. Cilium also offers a native BGP Control Plane and LB-IPAM.

Why the others are wrong:

- **Restart kube-proxy — iptables or ipvs modes** — kube-proxy implements ClusterIP and NodePort; it does not allocate or announce external addresses, so a restart changes nothing about a pending LoadBalancer.
- **CoreDNS — forward or rewrite modes** — CoreDNS resolves names; it cannot hand a Service an external IP or make the network route to it.
- **kubeadm — init or join modes** — kubeadm bootstraps control planes and joins nodes; it takes no part in Service addresses.
