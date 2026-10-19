**sessionAffinity: ClientIP** is correct: `sessionAffinity: ClientIP` keeps affinity by source IP (with `timeoutSeconds`, default 3h). It's the only native L4 affinity — cookie-based affinity requires an L7 proxy (Ingress/Gateway).

Why the others are wrong:

- **publishNotReadyAddresses: true** — it adds not-ready pods to DNS and endpoints; it does not tie a client to a pod.
- **topologyKeys** — `topologyKeys` was an alpha feature for topology-aware routing, removed in 1.22 — and it steered by node topology, not by client identity.
- **externalTrafficPolicy: Local** — `externalTrafficPolicy` decides whether traffic entering through a node may leave that node; it applies to external traffic and offers no stickiness to a pod.
