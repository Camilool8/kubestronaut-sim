**Canary deployment** is correct: a canary release exposes the new version to a small slice of real traffic (or a small subset of users) alongside the still-running old version, and gradually increases that slice as confidence grows. If the canary shows errors or regressions, only that small fraction of traffic was ever affected, and rolling back means simply routing traffic away from it.

Why the others are wrong:

- **Blue-green deployment** — blue-green runs two complete environments and cuts traffic over all at once from the old ("blue") to the new ("green"); it eliminates mixed-version traffic entirely rather than gradually ramping exposure, which is the opposite trade-off from a canary.
- **Rolling update** — a rolling update is Kubernetes' default Deployment strategy: it incrementally replaces old Pods with new ones based on replica counts, not based on observing a slice of live traffic's health before proceeding.
- **Recreate** — this strategy terminates every old Pod before creating any new ones, causing a period of full downtime; it has no gradual traffic-shifting behavior at all.
