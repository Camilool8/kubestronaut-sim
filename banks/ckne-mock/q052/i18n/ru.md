## Question

Какая метрика kube-proxy показывает, что программирование правил Service на узлах занимает слишком много времени?

## Options

- node_boot_time_seconds
- container_fs_usage_bytes
- kubeproxy_dns_latency_seconds_total
- kubeproxy_sync_proxy_rules_duration_seconds

## Solution

**kubeproxy_sync_proxy_rules_duration_seconds** — правильный ответ: `kubeproxy_sync_proxy_rules_duration_seconds` измеряет длительность синхронизации правил. В крупных кластерах с режимом iptables она растёт, создавая окна, когда новые endpoints ещё не получают трафик. Высокие значения являются аргументом в пользу IPVS или eBPF.
