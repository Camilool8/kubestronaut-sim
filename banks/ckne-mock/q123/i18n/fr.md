## Question

Pour mesurer disponibilité et latence des endpoints de bout en bout (depuis l'extérieur), en simulant l'expérience utilisateur, quelle approche ?

## Options

- Monitoring synthétique avec le Blackbox Exporter
- Seulement les logs des pods
- kubectl get events chaque minute via cron
- Plus de répliques de Prometheus et Grafana

## Solution

**Monitoring synthétique avec le Blackbox Exporter** est la bonne réponse : Les métriques internes ne capturent pas les pannes DNS publiques, le LB externe ni les certificats expirés. Les sondes synthétiques (HTTP/TCP/ICMP/DNS) testent le chemin complet à intervalles réguliers — `probe_success`/`probe_duration_seconds` deviennent le SLI de disponibilité externe.
