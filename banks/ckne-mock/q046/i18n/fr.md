## Question

Quelles métriques CoreDNS sont les plus utiles dans Prometheus pour détecter une dégradation DNS du cluster ?

## Options

- kubelet_running_pods
- coredns_dns_request_duration_seconds
- node_cpu_seconds_total
- etcd_disk_wal_fsync_duration_seconds

## Solution

**coredns_dns_request_duration_seconds** est la bonne réponse : Histogrammes de latence, taux d'erreurs par rcode (`coredns_dns_responses_total` : SERVFAIL/NXDOMAIN) et échecs de healthcheck upstream (`coredns_forward_healthcheck_failures_total`) sont le trépied du monitoring DNS. SERVFAIL ou p99 en hausse précèdent souvent des pannes applicatives massives.
