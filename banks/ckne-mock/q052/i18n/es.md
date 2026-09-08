## Question

¿Qué métrica de kube-proxy indica que las reglas de Service tardan demasiado en programarse en los nodos?

## Options

- node_boot_time_seconds
- container_fs_usage_bytes
- kubeproxy_dns_latency_seconds_total
- kubeproxy_sync_proxy_rules_duration_seconds

## Solution

**kubeproxy_sync_proxy_rules_duration_seconds** es la respuesta correcta: `kubeproxy_sync_proxy_rules_duration_seconds` mide el tiempo de sincronización de las reglas. En clusters grandes con modo iptables, este valor aumenta, creando ventanas en las que los endpoints nuevos todavía no reciben tráfico. Valores altos justifican IPVS o eBPF.
