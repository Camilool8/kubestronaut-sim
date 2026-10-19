**Announce the pod CIDRs via BGP** is correct: BGP-capable CNIs establish sessions with the routers and announce each node's podCIDRs. The external network learns the routes and reaches pods directly, eliminating encapsulation/NAT.

Why the others are wrong:

- **Create one NodePort per pod** — NodePort forwards through a node's own address; the pod IP is never exposed to the network, and one port per pod does not scale.
- **Enable hostNetwork on all pods** — hostNetwork removes the pod network entirely — pods use the node IP — rather than making pod IPs reachable.
- **Increase ndots in resolv.conf** — `ndots` is a resolver setting for DNS name expansion; it has no relation to routing.
