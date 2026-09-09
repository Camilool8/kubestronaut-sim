## Question

Um Verfügbarkeit und Latenz von Endpoints Ende-zu-Ende (von außen) zu messen und Nutzererfahrung zu simulieren — welcher Ansatz?

## Options

- Synthetisches Monitoring mit dem Blackbox Exporter
- Nur Pod-Logs
- kubectl get events jede Minute per Cron
- Mehr Prometheus- und Grafana-Replikas

## Solution

**Synthetisches Monitoring mit dem Blackbox Exporter** ist die richtige Antwort: Interne Metriken erfassen keine öffentlichen DNS-Fehler, externe LBs oder abgelaufene Zertifikate. Synthetische Probes (HTTP/TCP/ICMP/DNS) testen den vollen Pfad in Intervallen — `probe_success`/`probe_duration_seconds` werden zum externen Verfügbarkeits-SLI.
