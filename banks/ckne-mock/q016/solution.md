**The pod's readinessProbe is failing, removing it from load balancing** is correct: The `readinessProbe` controls endpoint availability: while it fails, the pod stays not-ready in the EndpointSlice and receives no traffic. This is the core "Pod Endpoint Availability" mechanism. Check events with `kubectl describe pod`.

Why the others are wrong:

- **CoreDNS keeps crashing** — DNS resolves the Service name to its VIP; it plays no part in which endpoints the VIP forwards to, and an EndpointSlice is produced by the endpoint controller, not by CoreDNS.
- **kube-proxy only works with pods declared ready: true in the manifest** — readiness is not declared in a manifest; the EndpointSlice's `ready` condition is computed by the kubelet's probe results, and kube-proxy only follows it.
- **The ClusterIP expired** — ClusterIPs do not expire; a Service keeps its VIP for its whole life.
