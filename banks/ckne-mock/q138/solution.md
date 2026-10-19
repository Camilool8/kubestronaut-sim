**No practical effect on the flow** is correct: Affinity is a function of the proxy over the VIP. Headless delivers pure DNS — the "balancer" is the resolver/client. Accepted configuration, null effect: an exam classic.

Why the others are wrong:

- **It turns the Service into NodePort** — the Service type is not changed by the affinity field.
- **Always a validation error** — the API server accepts the combination; the field is simply irrelevant to a VIP-less Service.
- **Perfect per-client affinity** — no proxy ever sees the connection — DNS returns the pod IPs and the client picks one — so nothing can enforce stickiness.
