**Graceful Restart (keeps routes during restart) and BFD (ms detection)** is correct: Graceful Restart distinguishes "planned restart" from "dead node", preserving forwarding; BFD speeds detection when the node REALLY dies. Together: upgrades without blackholes and sub-second failover.

Why the others are wrong:

- **Switching BGP to L2 always** — L2 mode has its own failover gaps (gratuitous ARP, seconds of blackholing) and gives up ECMP; it is a downgrade, not a fix.
- **Adding CoreDNS and kube-apiserver replicas during the upgrade** — control-plane replicas have nothing to do with a data-plane routing session between a node and its router.
- **Lowering the tunnel MTU between the nodes** — MTU affects packet size, not BGP session lifetime or route withdrawal timing.
