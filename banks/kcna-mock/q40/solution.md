**It adds or removes nodes in the cluster when pods cannot be scheduled or nodes are underutilized** is correct: the Cluster Autoscaler watches for pods stuck in Pending because no node has room for them and provisions new nodes to host them; conversely, it drains and removes nodes whose workloads can fit elsewhere. It operates at the infrastructure level, complementing the pod-level autoscalers.

Why the others are wrong:

- **It increases CPU and memory requests of individual pods** — adjusting per-pod resource requests is what the Vertical Pod Autoscaler does; the Cluster Autoscaler never edits pod specs.
- **It changes the number of replicas of a Deployment based on load** — replica counts are managed by the Horizontal Pod Autoscaler; the Cluster Autoscaler only reacts to the scheduling pressure those replicas create.
- **It rebalances pods evenly across existing nodes** — spreading or rebalancing running pods is the territory of the scheduler and tools like the descheduler; the Cluster Autoscaler changes cluster size, not pod placement.
