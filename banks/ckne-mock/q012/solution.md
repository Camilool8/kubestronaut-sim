**O(1) forwarding complexity and balancing algorithms** is correct: In iptables mode, rules grow with the number of Services and are evaluated sequentially. IPVS uses in-kernel hash tables (~O(1) lookup) and offers round-robin, least-connections, source-hash. Both remain L4.

Why the others are wrong:

- **Native L7 (HTTP) balancing support with header inspection** — IPVS is an L4 balancer in the kernel; it never reads HTTP headers — header-aware routing needs an L7 proxy such as an Ingress or Gateway implementation.
- **It doesn't need the conntrack module** — IPVS relies on conntrack just as iptables mode does; the DNAT it performs is tracked, and the conntrack-related DNS trap applies to both.
- **It encrypts pod-to-pod traffic** — no kube-proxy mode encrypts anything; pod-to-pod encryption comes from a CNI feature (WireGuard/IPsec) or a service mesh.
