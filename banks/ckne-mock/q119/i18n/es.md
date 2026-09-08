## Question

¿Qué grupos de métricas puede exportar Hubble a Prometheus cuando se habilita hubble.metrics?

## Options

- Solo uso de CPU
- dns, drop, tcp, flow, icmp, http
- Métricas de facturación del cloud
- Solo logs de texto

## Solution

**dns, drop, tcp, flow, icmp, http** es la respuesta correcta: Al habilitar `hubble.metrics.enabled={dns,drop,tcp,flow,icmp,http}`, Hubble expone series por namespace/workload: consultas y errores DNS, motivos de drop (policy, CT), flags TCP y códigos/latencias HTTP, base de los dashboards de red de Grafana/Cilium.
