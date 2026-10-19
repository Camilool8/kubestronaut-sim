**KUBE-SERVICES** is correct: The `KUBE-SERVICES` chain (called from PREROUTING/OUTPUT in the nat table) holds one rule per Service, jumping to `KUBE-SVC-*` chains that balance to `KUBE-SEP-*` chains (endpoints, where DNAT happens). Debug with `iptables -t nat -L KUBE-SERVICES`.

Why the others are wrong:

- **KUBE-NODEPORTS** — reached from the end of KUBE-SERVICES to match NodePort traffic that matched no ClusterIP — a secondary chain, not the entry point.
- **CNI-ISOLATION** — not a kube-proxy chain at all; network-policy implementations install their own chains (Calico's `cali-*`, for instance) in the filter table.
- **KUBE-FORWARD** — lives in the filter table and only accepts already-translated, conntrack-marked packets — it never performs Service matching or DNAT.
