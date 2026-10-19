**Routes to the other nodes' podCIDRs via the neighbor node IP** is correct: In direct/native routing mode, packets aren't encapsulated: each node must know the neighbor's podCIDR is reachable via the neighbor's IP. These routes are installed by the CNI or learned via BGP. Their absence breaks cross-node traffic.

Why the others are wrong:

- **/32 routes for every pod in the entire cluster** — per-pod host routes would scale with the pod count and churn on every scheduling event; native routing works on one aggregate route per node CIDR.
- **No pod-related routes** — with no encapsulation, the routing table is the only thing that tells the kernel where another node's pods live — no routes means no cross-node traffic.
- **Only the default route pointing at the physical gateway** — sending pod traffic to the physical gateway only works if that gateway knows the pod CIDRs, which is the BGP-to-fabric variant; a plain default route drops or misroutes it.
