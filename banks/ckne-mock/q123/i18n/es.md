## Question

Para medir la disponibilidad y latencia end-to-end de los endpoints desde el exterior, simulando la experiencia del usuario, ¿qué enfoque se utiliza?

## Options

- Monitorización sintética con Blackbox Exporter
- Solo logs de los pods
- kubectl get events cada minuto mediante cron
- Añadir réplicas de Prometheus y Grafana

## Solution

**Monitorización sintética con Blackbox Exporter** es la respuesta correcta: Las métricas internas no capturan fallos del DNS público, del LB externo o certificados caducados. Las probes sintéticas prueban todo el recorrido a intervalos regulares; `probe_success`/`probe_duration_seconds` de Blackbox Exporter se convierten en el SLI de disponibilidad externa.
