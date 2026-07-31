**Horizontal Pod Autoscaler (HPA)** is correct: the HPA compares observed metrics such as average CPU utilization against a target and adjusts the replica count of a Deployment (or similar workload) to match, scaling out during the daytime spike and back in at night. Changing the *number* of pods is exactly what "horizontal" scaling means.

Why the others are wrong:

- **Vertical Pod Autoscaler (VPA)** — the VPA adjusts the CPU and memory requests of individual pods to right-size them; it does not change how many replicas are running.
- **Cluster Autoscaler** — this changes the number of *nodes* in the cluster when pods cannot be scheduled or nodes sit idle; it reacts to scheduling pressure, not directly to an application's CPU utilization.
- **kube-scheduler** — the scheduler only chooses which node each new pod lands on; it never creates or removes replicas on its own.
