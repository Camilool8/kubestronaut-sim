**ServiceEntry** is correct: `ServiceEntry` adds external hosts to Istio's registry. Combined with VirtualService/DestinationRule and an egress gateway, it lets you control, monitor and encrypt traffic leaving the mesh — including REGISTRY_ONLY blocking undeclared destinations.

Why the others are wrong:

- **EgressClass** — there is no `EgressClass` in Istio (nor in Gateway API); egress gateways are ordinary Gateways with routing rules pointing at external hosts.
- **OutboundPolicy** — `OutboundPolicy` is not an Istio resource; the mesh-wide `outboundTrafficPolicy` is a mesh config setting that decides whether unregistered hosts are allowed, not a registration.
- **ExternalName** — ExternalName is a Kubernetes Service type producing a CNAME; Istio can route to it, but it does not add a host to the mesh registry with policy and TLS control.
