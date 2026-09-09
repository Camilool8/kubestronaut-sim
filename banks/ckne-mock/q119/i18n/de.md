## Question

Welche Metrikgruppen kann Hubble nach Prometheus exportieren (hubble.metrics)?

## Options

- Nur CPU-Verbrauch
- dns, drop, tcp, flow, icmp, http
- Cloud-Billing-Metriken
- Nur Text-Logs

## Solution

**dns, drop, tcp, flow, icmp, http** ist die richtige Antwort: Mit `hubble.metrics.enabled={dns,drop,tcp,flow,icmp,http}` liefert Hubble Serien pro Namespace/Workload: DNS-Queries und -Fehler, Drop-Gründe (Policy, CT), TCP-Flags und HTTP-Codes/-Latenzen — Basis der Grafana/Cilium-Netzwerk-Dashboards.
