**Replacing Service logic with eBPF programs, without kube-proxy** is correct: Cilium implements ClusterIP/NodePort/LoadBalancer with eBPF (socket-level LB and XDP), eliminating kube-proxy and the iptables chains — reducing latency and improving scale. Check with `cilium status | grep KubeProxyReplacement`.

Why the others are wrong:

- **Delegating Service resolution to CoreDNS with a dedicated plugin** — CoreDNS resolves names to VIPs; it never forwards a packet, so it cannot take over what kube-proxy does with the packets.
- **Running two kube-proxy instances per node** — two instances would program the same rules twice, or fight over them; "replacement" means removing kube-proxy, not duplicating it.
- **Using an HTTP proxy instead of kube-proxy** — an HTTP proxy works at L7 for HTTP only; Service load balancing is L4 for any TCP/UDP/SCTP traffic and is done in the kernel.
