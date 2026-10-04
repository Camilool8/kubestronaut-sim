**VIPs are DNAT rules, with no interface to answer ICMP** is correct: Troubleshooting trap: the VIP isn't assigned to any interface; iptables/IPVS/eBPF only translate `VIP:port`. Test Services with `nc -zv`/`curl`, never with ping.

Why the others are wrong:

- **ICMP requires NodePort** — NodePort exposes TCP/UDP ports on node addresses; it has nothing to do with whether a ClusterIP answers echo requests, and ClusterIPs never do.
- **The Service is broken and curl uses a cache** — curl performs a real TCP handshake and HTTP exchange with a backend; a working response proves the Service path, and curl caches nothing by default.
- **The firewall blocks curl** — if a firewall blocked curl, the connection would fail — it is the ping that fails, and it fails by design, not by policy.
