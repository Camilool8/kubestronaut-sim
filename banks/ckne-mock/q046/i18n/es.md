## Question

¿Qué métricas de CoreDNS son más útiles para detectar degradación del DNS del cluster en Prometheus?

## Options

- kubelet_running_pods
- coredns_dns_request_duration_seconds
- node_cpu_seconds_total
- etcd_disk_wal_fsync_duration_seconds

## Solution

**coredns_dns_request_duration_seconds** es la respuesta correcta: Los histogramas de latencia, la tasa de errores por rcode y los fallos de healthcheck de los upstreams forman el trípode de la monitorización DNS. Un aumento de SERVFAIL o de p99 suele preceder a fallos generalizados de las aplicaciones.
