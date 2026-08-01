**Canary deployment** is correct: a canary release exposes the new version to a small slice of real traffic first, uses metrics such as error rate and latency to judge its health, and then progressively shifts more traffic until the new version fully replaces the old one. Limiting the blast radius while validating against real users is the defining trait of this strategy.

Why the others are wrong:

- **Blue-green deployment** — Blue-green runs two full environments and switches all traffic at once from the old to the new version; it does not gradually shift a small percentage while observing metrics.
- **Recreate deployment** — The recreate strategy stops every old Pod before starting new ones, causing downtime and giving no opportunity to test the new version on a fraction of traffic.
- **Rolling update** — A rolling update replaces Pods incrementally, but traffic distribution follows the Pod replacement rate rather than a deliberate, metric-gated percentage of user traffic; it is Kubernetes' default Deployment behavior, not a controlled canary analysis.
