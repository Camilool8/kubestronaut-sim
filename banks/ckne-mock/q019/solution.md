**Gateway is managed by the infrastructure operator and defines listeners/addresses** is correct: Persona-oriented model: `GatewayClass` (implementation), `Gateway` (infra: listeners, ports, TLS) and `HTTPRoute` (app: matches, filters, backends). The route references the Gateway in `parentRefs` and Services in `backendRefs`.

Why the others are wrong:

- **Both do the same thing, HTTPRoute is just the new name** — they are distinct resources with distinct owners: one describes where traffic enters, the other how requests are matched and routed.
- **Gateway defines routing rules; HTTPRoute defines listeners** — the roles are reversed — listeners (ports, protocols, TLS, hostnames) belong to the Gateway; routing rules belong to the HTTPRoute.
- **HTTPRoute replaces the Service; Gateway replaces the Deployment** — neither replaces workload resources: an HTTPRoute still sends traffic to Services in `backendRefs`, and Deployments still run the pods behind them.
