**Synthetic monitoring with Blackbox Exporter** is correct: Internal metrics don't capture public DNS failures, external LB or expired certificates. Synthetic probes test the full path at regular intervals — Blackbox Exporter's `probe_success`/`probe_duration_seconds` become the external availability SLI.

Why the others are wrong:

- **Only pod logs** — pod logs show what the application saw from inside; an expired public certificate or a dead external load balancer never appears in them.
- **kubectl get events every minute via cron** — events describe object lifecycle inside the cluster; they contain no measurement of user-facing latency or availability.
- **Adding Prometheus and Grafana replicas** — more monitoring replicas make the monitoring more available; they do not add an outside-in probe.
