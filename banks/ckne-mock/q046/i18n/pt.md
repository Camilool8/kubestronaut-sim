## Question

Quais métricas do CoreDNS são mais úteis para detectar degradação do DNS do cluster no Prometheus?

## Options

- kubelet_running_pods
- coredns_dns_request_duration_seconds
- node_cpu_seconds_total
- etcd_disk_wal_fsync_duration_seconds

## Solution

**coredns_dns_request_duration_seconds** é a resposta correta: Latência por histograma, taxa de erros por rcode e falhas de healthcheck dos upstreams são o tripé do monitoramento de DNS. Aumento de SERVFAIL ou da p99 costuma anteceder falhas generalizadas de aplicações.
