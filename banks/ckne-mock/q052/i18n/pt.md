## Question

Qual métrica do kube-proxy indica que as regras de Service estão demorando a ser programadas nos nós?

## Options

- node_boot_time_seconds
- container_fs_usage_bytes
- kubeproxy_dns_latency_seconds_total
- kubeproxy_sync_proxy_rules_duration_seconds

## Solution

**kubeproxy_sync_proxy_rules_duration_seconds** é a resposta correta: `kubeproxy_sync_proxy_rules_duration_seconds` mede o tempo de sincronização das regras. Em clusters grandes no modo iptables, esse tempo cresce — janelas em que endpoints novos ainda não recebem tráfego. Valores altos justificam IPVS ou eBPF.
