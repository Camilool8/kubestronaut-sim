## Question

Was sind Exemplars in Prometheus, und wie helfen sie beim Troubleshooting von Netzwerk-Latenz?

## Options

- Fertige Grafana-Dashboards
- E-Mail-Alerts mit angehängten Diagrammen
- Backup-Replikas von Prometheus
- Samples in Histogramm-Buckets mit Trace-IDs

## Solution

**Samples in Histogramm-Buckets mit Trace-IDs** ist die richtige Antwort: Exemplars verknüpfen Metriken mit Traces: Steigt p99 in Grafana, klickt man das Exemplar des langsamen Buckets und öffnet den exakten Trace (Tempo/Jaeger) — Metriken → Traces → Logs vereint, um den verantwortlichen Hop zu finden.
