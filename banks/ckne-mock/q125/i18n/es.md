## Question

¿Qué son los exemplars en Prometheus y cómo ayudan a investigar la latencia de red?

## Options

- Dashboards prediseñados de Grafana
- Alertas por correo con gráficos adjuntos
- Réplicas de backup de Prometheus
- Muestras en buckets de histograma que incluyen trace IDs

## Solution

**Muestras en buckets de histograma que incluyen trace IDs** es la respuesta correcta: Los exemplars conectan métricas con traces: al ver aumentar p99 en Grafana, se hace clic en el exemplar del bucket lento y se abre el trace exacto (Tempo/Jaeger), uniendo los tres pilares (métricas → traces → logs) para localizar el salto responsable de la latencia.
