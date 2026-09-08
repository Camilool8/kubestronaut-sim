## Question

Quais grupos de métricas o Hubble pode exportar para o Prometheus quando habilitados (hubble.metrics)?

## Options

- Apenas uso de CPU
- dns, drop, tcp, flow, icmp, http
- Métricas de billing da nuvem
- Somente logs de texto

## Solution

**dns, drop, tcp, flow, icmp, http** é a resposta correta: Habilitando `hubble.metrics.enabled={dns,drop,tcp,flow,icmp,http}`, o Hubble expõe séries por namespace/workload: consultas e erros DNS, motivo dos drops (policy, CT), flags TCP e códigos/latências HTTP — a base dos dashboards de rede do Grafana/Cilium.
