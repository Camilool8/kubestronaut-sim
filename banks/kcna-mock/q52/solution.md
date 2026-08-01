**Blue-green deployment, keeping two identical environments and switching traffic between them** is correct: in blue-green delivery, the current version (blue) keeps serving users while the new version (green) is deployed and verified alongside it. Cutting traffic over is a single routing change, so all users move at once, and rollback is equally instant—point traffic back at the blue environment. The cost is running two full environments in parallel, which this company accepts.

Why the others are wrong:

- **Rolling update, replacing Pods a few at a time** — A rolling update moves users over gradually as Pods are replaced, and rolling back requires another rollout rather than an instant traffic switch.
- **Canary release, shifting a small share of traffic first** — A canary deliberately exposes only a fraction of users to the new version at first, which contradicts the requirement to switch everyone at once.
- **Recreate strategy, stopping the old version before starting the new one** — Recreate causes downtime between versions and leaves no running old environment to switch back to instantly.
