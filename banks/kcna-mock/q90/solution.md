**To ensure that a copy of a specific Pod runs on every node (or every node matching a selector) in the cluster, automatically adding a copy to new nodes as they join** is correct: DaemonSets exist for exactly the workloads a Deployment's replica-count model does not fit — node-level agents such as log collectors, monitoring exporters, or CNI plugins that need to run once per node, no more and no less, regardless of how the cluster scales.

Why the others are wrong:

- **To run a Pod exactly once and then guarantee it terminates successfully** — that describes a Job, whose whole purpose is a bounded task run to completion; a DaemonSet's Pods are meant to run continuously, one per matching node.
- **To run Pods on a fixed schedule, similar to a cron job** — scheduled, recurring execution is what a CronJob provides; a DaemonSet has no time-based scheduling concept at all.
- **To scale a Pod's replica count up and down automatically based on CPU usage** — that describes a HorizontalPodAutoscaler; a DaemonSet's replica count is determined entirely by the number of matching nodes, not by any metric.
