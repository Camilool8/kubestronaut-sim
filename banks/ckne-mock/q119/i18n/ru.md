## Question

Какие группы метрик Hubble может экспортировать в Prometheus при включённом hubble.metrics?

## Options

- Только использование CPU
- dns, drop, tcp, flow, icmp, http
- Метрики cloud billing
- Только текстовые logs

## Solution

**dns, drop, tcp, flow, icmp, http** — правильный ответ: При `hubble.metrics.enabled={dns,drop,tcp,flow,icmp,http}` Hubble публикует series по namespace/workload: DNS queries/errors, причины drops (policy, CT), TCP flags и HTTP codes/latencies — основу сетевых dashboards Grafana/Cilium.
