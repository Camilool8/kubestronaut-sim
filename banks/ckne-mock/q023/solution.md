**Forwards only to node-local endpoints, preserving the client IP** is correct: With `Local`, a node only forwards to local pods — no SNAT, so the real client IP is preserved. Nodes without endpoints are removed from the LB via healthCheckNodePort. With `Cluster` (default), there may be a second hop with SNAT.

Why the others are wrong:

- **Restricts access to clients on the same subnet** — the policy never inspects client addresses; it decides where a node may forward, and "Local" refers to endpoints on the receiving node.
- **Forces IPVS mode** — the proxy mode is a kube-proxy startup setting, unrelated to any per-Service field.
- **Disables balancing and sends everything to the first endpoint** — balancing continues across every ready endpoint that sits on the receiving node; only remote endpoints are excluded.
