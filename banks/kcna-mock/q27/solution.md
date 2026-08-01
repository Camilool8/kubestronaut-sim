**Automatically replacing containers that fail so the actual state matches the declared desired state** and **Scaling the number of running replicas up or down in response to demand** are correct: an orchestrator continuously reconciles the cluster's actual state toward the desired state you declare, which is what enables self-healing (restarting or replacing failed containers) and scaling (adjusting replica counts as demand changes). These reconciliation loops are the core value of orchestration compared to running containers by hand.

Why the others are wrong:

- **Compiling application source code into container images on every deployment** — building images is the job of a CI pipeline and a build tool; the orchestrator only pulls and runs images that already exist in a registry.
- **Guaranteeing that application code is free of bugs before it runs** — no orchestrator can verify application correctness; it manages where and how containers run, not the quality of the code inside them.
