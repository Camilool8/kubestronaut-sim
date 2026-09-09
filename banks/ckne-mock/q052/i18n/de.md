## Question

Welche kube-proxy-Metrik zeigt, dass Service-Regeln auf den Nodes lange zum Programmieren brauchen?

## Options

- node_boot_time_seconds
- container_fs_usage_bytes
- kubeproxy_dns_latency_seconds_total
- kubeproxy_sync_proxy_rules_duration_seconds

## Solution

**kubeproxy_sync_proxy_rules_duration_seconds** ist die richtige Antwort: `kubeproxy_sync_proxy_rules_duration_seconds` misst die Regel-Synchronisierung. In großen Clustern im iptables-Modus wächst sie — Zeitfenster, in denen neue Endpoints noch keinen Traffic bekommen. Hohe Werte rechtfertigen IPVS oder eBPF.
