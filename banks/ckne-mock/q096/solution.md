**All traffic for a VIP enters through ONE elected node** is correct: In L2, a single node answers ARP for the VIP: inbound bandwidth is limited to that node and failover depends on gratuitous ARP (seconds of unavailability). BGP+ECMP solves both — hence the preferred production mode.

Why the others are wrong:

- **It requires a commercial MetalLB Enterprise license** — MetalLB is Apache-licensed open source; there is no commercial edition to unlock.
- **It doesn't support TCP, only UDP** — L2 announcement works below the transport layer — it answers ARP for the VIP — so TCP and UDP both pass through it.
- **It doesn't work with IPv4, only dual-stack IPv6** — L2 mode uses ARP for IPv4 and NDP for IPv6; both families are supported.
