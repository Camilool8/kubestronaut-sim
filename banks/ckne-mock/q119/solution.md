**dns, drop, tcp, flow, icmp, http** is correct: Enabling `hubble.metrics.enabled={dns,drop,tcp,flow,icmp,http}`, Hubble exposes series per namespace/workload: DNS queries and errors, drop reasons (policy, CT), TCP flags and HTTP codes/latencies — the basis of the Grafana/Cilium network dashboards.

Why the others are wrong:

- **Only CPU usage** — Hubble reads network events from the eBPF datapath; CPU accounting comes from cAdvisor and node_exporter.
- **Cloud billing metrics** — cost data lives in the cloud provider's billing APIs, far from a CNI observability layer.
- **Only text logs** — Hubble produces structured flows (CLI and JSON) and Prometheus metrics; it is not a text-log tool.
