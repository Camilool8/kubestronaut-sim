**Yes, with Globalnet: virtual CIDRs + cross-cluster NAT** is correct: Overlapping CIDRs prevent direct routing (same network on both sides). Submariner Globalnet creates virtual globalCIDRs + ingress/egress NAT — the specific solution for brownfields with repeated ranges.

Why the others are wrong:

- **Only if one cluster is IPv6** — the address family does not resolve the overlap; identical IPv4 ranges stay ambiguous until a NAT layer maps them to distinct virtual ones.
- **No, overlapping CIDRs prevent any connection** — direct routing is indeed impossible, but that is exactly the case Globalnet was built for.
- **Yes, with no configuration at all** — without Globalnet, overlapping ranges make every remote pod address ambiguous — configuration is required.
