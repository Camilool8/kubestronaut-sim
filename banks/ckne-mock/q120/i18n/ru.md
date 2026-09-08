## Question

При применении «golden signals» к сети кластера какой набор соответствует latency, traffic, errors и saturation?

## Options

- Replicas, nodes, namespaces и установленные CRDs
- Latency, bytes/s, ошибки 5xx/retrans и saturation conntrack
- Commits, builds, deploys и rollbacks за день
- CPU, memory, disk и uptime worker nodes

## Solution

**Latency, bytes/s, ошибки 5xx/retrans и saturation conntrack** — правильный ответ: Четыре сигнала напрямую отображаются на p99 latency, throughput bytes/pps, error rate retrans/resets/drops/5xx и saturation — conntrack entries/limit, qdisc drops, utilization bandwidth. Alerts по ним охватывают большинство сетевых деградаций.
