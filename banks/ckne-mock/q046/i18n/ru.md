## Question

Какие метрики CoreDNS наиболее полезны для обнаружения деградации DNS кластера в Prometheus?

## Options

- kubelet_running_pods
- coredns_dns_request_duration_seconds
- node_cpu_seconds_total
- etcd_disk_wal_fsync_duration_seconds

## Solution

**coredns_dns_request_duration_seconds** — правильный ответ: Гистограммы задержки, частота ошибок по rcode и сбои healthcheck upstream — три основы мониторинга DNS. Рост SERVFAIL или p99 обычно предшествует массовым сбоям приложений.
