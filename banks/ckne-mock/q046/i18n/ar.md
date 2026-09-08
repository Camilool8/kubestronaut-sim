## Question

أي metrics من CoreDNS هي الأكثر فائدة لاكتشاف تدهور DNS في الكلاستر عبر Prometheus؟

## Options

- kubelet_running_pods
- coredns_dns_request_duration_seconds
- node_cpu_seconds_total
- etcd_disk_wal_fsync_duration_seconds

## Solution

**coredns_dns_request_duration_seconds** هي الإجابة الصحيحة: المهم هو histogram زمن الاستجابة، ومعدل الأخطاء حسب rcode، وفشل healthcheck للـ upstream. ارتفاع SERVFAIL أو p99 غالباً يسبق الأعطال الواسعة في التطبيقات.
