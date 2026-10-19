**IPIP uses IP protocol 4 (not TCP/UDP), often blocked by cloud security groups/firewalls that only allow TCP/UDP/ICMP** is correct: IPIP encapsulation has no ports — it's IP protocol number 4. Security groups filtering by TCP/UDP silently drop it. VXLAN (UDP 4789/8472) usually passes. Allow protocol 4 or go back to VXLAN.

Why the others are wrong:

- **The MTU increased by itself** — IPIP overhead (20 bytes) is smaller than VXLAN's (about 50), so the migration relaxes MTU pressure rather than adding it.
- **IPIP no longer exists** — IPIP is a long-standing Linux tunnel type and a supported Calico encapsulation mode.
- **kube-proxy hates IPIP** — kube-proxy operates on Service VIPs above the CNI; the encapsulation between nodes is invisible to it.
