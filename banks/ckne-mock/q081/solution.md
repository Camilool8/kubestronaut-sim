**Delivers internal traffic only to endpoints on the client's node** is correct: It's the internal analogue of externalTrafficPolicy: useful for per-node daemons (e.g., log agent, node-local cache) where each pod should talk to its own node's instance — saving hops and latency.

Why the others are wrong:

- **Blocks all traffic coming from outside the cluster** — external traffic is governed by `externalTrafficPolicy`; the internal policy only concerns traffic originating inside the cluster.
- **Replaces CoreDNS** — it is a Service routing preference; DNS is untouched.
- **Enables internal mTLS** — encryption between pods comes from a mesh or a CNI feature; this field only restricts endpoint selection to the client's node.
