**A serverless platform such as Knative, which can scale workloads down to zero between requests** is correct: scale-to-zero is a defining feature of serverless platforms. Knative Serving buffers incoming requests while it starts the workload, scales replicas up with request traffic, and removes all replicas again once the service has been idle, which matches the bursty, mostly-idle pattern described.

Why the others are wrong:

- **A Horizontal Pod Autoscaler adjusting the replica count based on CPU utilization** — the HPA adds and removes replicas within a configured range, but it is not designed to scale a standard Deployment down to zero replicas and wake it on an incoming request.
- **A Vertical Pod Autoscaler resizing the containers' CPU and memory requests** — the VPA changes the resource sizing of individual Pods; it does not change the number of replicas and cannot make the service disappear when idle.
- **The Cluster Autoscaler adding worker nodes when Pods cannot be scheduled** — the Cluster Autoscaler operates on nodes, not application replicas. It complements workload autoscaling but does nothing to scale a service to zero or start it on demand.
