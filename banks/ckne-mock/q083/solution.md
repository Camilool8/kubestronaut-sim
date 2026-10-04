**Defining the implementation/controller that materializes Gateways** is correct: `GatewayClass` (cluster-scoped) says WHO implements: `controllerName` points at the controller (e.g., istio.io/gateway-controller, gateway.envoyproxy.io/...). A cluster can have several classes (internal, external, mesh) and each Gateway references one.

Why the others are wrong:

- **Grouping HTTPRoutes by version** — HTTPRoutes attach to Gateways, not to classes, and carry no version grouping.
- **Defining TLS certificates** — TLS certificates are referenced by Gateway listeners (`tls.certificateRefs`), not by the class.
- **Mandatorily replacing IngressClass across the cluster** — GatewayClass and IngressClass coexist; Ingress objects keep working while Gateway API is adopted.
