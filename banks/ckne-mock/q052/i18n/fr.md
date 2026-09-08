## Question

Quelle métrique de kube-proxy indique que les règles de Service mettent longtemps à être programmées sur les nœuds ?

## Options

- node_boot_time_seconds
- container_fs_usage_bytes
- kubeproxy_dns_latency_seconds_total
- kubeproxy_sync_proxy_rules_duration_seconds

## Solution

**kubeproxy_sync_proxy_rules_duration_seconds** est la bonne réponse : `kubeproxy_sync_proxy_rules_duration_seconds` mesure le temps de synchronisation des règles. Dans les gros clusters en mode iptables, elle grandit — fenêtres où les nouveaux endpoints ne reçoivent pas encore de trafic. Des valeurs hautes justifient IPVS ou eBPF.
