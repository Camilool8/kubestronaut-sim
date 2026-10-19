**Samples in histogram buckets carrying trace IDs** is correct: Exemplars link metrics to traces: seeing p99 rise in Grafana, you click the slow bucket's exemplar and open the exact trace (Tempo/Jaeger) — uniting the three pillars (metrics → traces → logs) to find the hop responsible for the latency.

Why the others are wrong:

- **Ready-made Grafana dashboards** — dashboards visualise series; exemplars are data attached to the series themselves.
- **Email alerts with charts attached** — alert notifications carry no trace linkage.
- **Prometheus backup replicas** — replication is about Prometheus availability, unrelated to histogram samples.
