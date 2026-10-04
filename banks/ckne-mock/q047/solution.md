**Hubble (observe, UI, metrics)** is correct: `Hubble` reads eBPF datapath events: `hubble observe --verdict DROPPED` shows which flow was blocked and by which policy. It also exports flow/DNS/HTTP metrics to Prometheus.

Why the others are wrong:

- **etcdctl watch /network** — etcd holds API objects, not packets; there is no `/network` key to watch, and flows never pass through it.
- **CriticTool** — not a real tool.
- **kubectl top pods --network** — `kubectl top` reports CPU and memory from metrics-server and has no `--network` flag; it never sees flows or verdicts.
