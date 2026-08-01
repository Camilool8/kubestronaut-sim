**Average CPU utilization across the target's Pods** and **Average memory utilization across the target's Pods** are both correct, along with **a custom or external metric supplied through the metrics API (such as requests per second from an ingress controller)**: an HPA is configured with one or more metric sources — the built-in `resource` metrics (CPU and memory) that the metrics-server provides out of the box, and, when the cluster has the custom/external metrics APIs installed, application- or infrastructure-specific metrics like queue depth or request rate. Whichever metrics are configured, the HPA periodically compares the current value against a target and adjusts replica count to converge on it.

Why the other option is wrong:

- **The Pod's own restart count** — an HPA never scales based on how many times a Pod's containers have restarted; restart count is a health/reliability signal the kubelet and monitoring tooling track, not a load signal the autoscaler acts on.
