**The VXLAN UDP port is blocked between the nodes** is correct: Inter-node traffic depends on the encapsulation. If a firewall blocks the VXLAN UDP port (8472 for Flannel/Cilium, 4789 IANA default), cross-node communication fails. Check with `tcpdump -i any udp port 8472` and the firewall/security group rules.

Why the others are wrong:

- **kube-scheduler is misconfigured** — scheduling decides where pods run and plays no part in packet delivery afterwards; same-node traffic working shows the pods themselves are fine.
- **Pods need hostPort for cross-node traffic** — pod-to-pod traffic never needs hostPort; the overlay carries it, and hostPort only exposes a container port on the node's own address.
- **CoreDNS is down** — a DNS failure would break name resolution for every pod alike, including pairs on the same node — an IP-level, cross-node-only failure points at the tunnel.
