**ECMP (Equal-Cost Multi-Path)** is correct: With ECMP, each flow (5-tuple hash) is sent to one of the announcing nodes — real network-layer balancing, with fast convergence when a node stops announcing (BFD speeds up detection).

Why the others are wrong:

- **Reverse NAT at the edge router** — NAT on the router would rewrite addresses; it does not choose among several next hops for the same prefix.
- **DNS round-robin with a low TTL** — DNS spreads clients across different addresses; here there is a single VIP, and DNS is not consulted per packet.
- **STP (Spanning Tree Protocol) between the switches** — STP prevents L2 loops by blocking links; it never balances traffic and plays no role in L3 route selection.
