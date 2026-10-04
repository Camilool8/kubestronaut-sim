**kubeproxy_sync_proxy_rules_duration_seconds** is correct: `kubeproxy_sync_proxy_rules_duration_seconds` measures rule sync time. In large clusters in iptables mode this grows — windows where new endpoints don't yet receive traffic. High values justify IPVS or eBPF.

Why the others are wrong:

- **node_boot_time_seconds** — the boot timestamp of the node never changes while it runs; it says nothing about rule programming.
- **container_fs_usage_bytes** — container filesystem usage is storage, unrelated to Service rules.
- **kubeproxy_dns_latency_seconds_total** — kube-proxy exposes no DNS latency metric; DNS is CoreDNS's domain.
