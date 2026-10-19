**Latency, bytes/s, 5xx/retrans errors and conntrack saturation** is correct: The four signals map directly: latency p99, throughput (bytes/pps), error rate (retrans/resets/drops/5xx) and saturation (conntrack entries/limit, qdisc drops, bandwidth utilization). Alerting on them covers most network degradations.

Why the others are wrong:

- **Replicas, nodes, namespaces and CRDs installed in the cluster** — inventory counts describe cluster size; none is a latency, rate, error or saturation signal.
- **Commits, builds, deploys and rollbacks per day** — delivery-pipeline metrics measure engineering throughput, not how the network behaves.
- **CPU, memory, disk and uptime of the worker nodes** — node resource metrics are useful but describe compute; the network's own saturation signal is conntrack, queue drops and link utilisation.
