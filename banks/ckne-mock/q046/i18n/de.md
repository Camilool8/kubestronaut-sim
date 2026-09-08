## Question

Welche CoreDNS-Metriken sind in Prometheus am nützlichsten, um DNS-Degradierung im Cluster zu erkennen?

## Options

- kubelet_running_pods
- coredns_dns_request_duration_seconds
- node_cpu_seconds_total
- etcd_disk_wal_fsync_duration_seconds

## Solution

**coredns_dns_request_duration_seconds** ist die richtige Antwort: Latenz-Histogramme, Fehlerrate nach rcode (`coredns_dns_responses_total`: SERVFAIL/NXDOMAIN) und Upstream-Healthcheck-Fehler (`coredns_forward_healthcheck_failures_total`) sind das Dreibein des DNS-Monitorings. Steigende SERVFAIL/p99 gehen breiten Ausfällen meist voraus.
