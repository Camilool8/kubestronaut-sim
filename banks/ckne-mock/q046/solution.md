**coredns_dns_request_duration_seconds** is correct: Latency histograms, error rate by rcode and upstream healthcheck failures are the tripod of DNS monitoring. Rising SERVFAIL or p99 usually precedes widespread application failures.

Why the others are wrong:

- **kubelet_running_pods** — counts pods on a node; it moves with scheduling, not with DNS health.
- **node_cpu_seconds_total** — node CPU can be saturated or idle while DNS fails for entirely different reasons (upstream, conntrack, misconfiguration); it is not a DNS signal.
- **etcd_disk_wal_fsync_duration_seconds** — etcd fsync latency degrades the API server and writes; pods resolving names never touch etcd.
