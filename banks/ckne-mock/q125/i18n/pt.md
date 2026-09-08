## Question

O que são exemplars no Prometheus e como ajudam no troubleshooting de latência de rede?

## Options

- Dashboards prontos do Grafana
- Alertas por e-mail com gráficos anexados
- Réplicas de backup do Prometheus
- Amostras nos buckets de histogramas com trace IDs

## Solution

**Amostras nos buckets de histogramas com trace IDs** é a resposta correta: Exemplars ligam métricas a traces: ao ver a p99 subir no Grafana, você clica no exemplar do bucket lento e abre o trace exato (Tempo/Jaeger) — unindo os três pilares (métricas → traces → logs) para achar o salto responsável pela latência.
