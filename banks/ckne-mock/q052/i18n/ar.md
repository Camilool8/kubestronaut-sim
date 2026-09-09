## Question

أي metric في kube-proxy تشير إلى أن برمجة قواعد Service على العقد تستغرق وقتاً طويلاً؟

## Options

- node_boot_time_seconds
- container_fs_usage_bytes
- kubeproxy_dns_latency_seconds_total
- kubeproxy_sync_proxy_rules_duration_seconds

## Solution

**kubeproxy_sync_proxy_rules_duration_seconds** هي الإجابة الصحيحة: تقيس `kubeproxy_sync_proxy_rules_duration_seconds` زمن مزامنة القواعد. ترتفع في clusters الكبيرة بوضع iptables وتخلق نافذة لا تصل فيها الحركة إلى endpoints الجديدة؛ قد يبرر ذلك IPVS أو eBPF.
