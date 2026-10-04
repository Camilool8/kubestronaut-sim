**That node's kube-proxy is down or didn't program the rules** is correct: ClusterIP is materialized PER NODE (iptables/IPVS/eBPF). If a single node fails to reach VIPs, local programming is broken: kube-proxy crashing, rules not synced or a local firewall conflict. Compare `iptables-save` across nodes.

Why the others are wrong:

- **CoreDNS is down on every replica** — a dead CoreDNS would break name resolution everywhere, and by IP it would not matter; the failure here is per node and pod-to-pod IP works.
- **The namespace is being deleted in the background** — namespace deletion removes pods and Services cluster-wide; it would not single out one node.
- **The container image is wrong** — an image problem would break the pods themselves, on every node they run, not the VIP path from one node.
