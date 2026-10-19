**A VIP provider (LB-IPAM/MetalLB) for the address is missing** is correct: Same root as the classic "LoadBalancer pending": the Gateway implementation asks for an address, and on bare metal nobody answers. LB-IPAM/MetalLB allocate the IP; L2 or BGP announce it.

Why the others are wrong:

- **Annotate the Gateway with the master node's static-ip** — no such annotation exists, and a control-plane node's IP is not a VIP the implementation would announce or program.
- **The HTTPRoute must come before the Gateway** — resource creation order does not matter; routes attach whenever both objects exist, and the address is a Gateway concern independent of routes.
- **Restart the apiserver** — the API server has nothing to allocate; address assignment belongs to the Gateway implementation and its IPAM.
