**Keeping traffic within the same availability zone** is correct: With hints, each kube-proxy prefers same-zone endpoints — cutting cross-AZ traffic fees and latency. If a zone has too few endpoints for its traffic share, local overload can occur; the mechanism disables hints on very asymmetric distributions.

Why the others are wrong:

- **Encrypting all traffic; the trade-off is CPU usage** — topology hints do not encrypt anything; they influence endpoint selection only.
- **Reducing DNS lookups; the trade-off is cache** — DNS returns the same ClusterIP regardless of zone; hints act at kube-proxy level after resolution.
- **Increasing replicas; the trade-off is memory** — the feature changes how existing endpoints are chosen; it never scales workloads.
