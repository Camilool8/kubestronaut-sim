## Question

Apps klagen über langsame Auflösung externer Namen (z. B. api.github.com) aus Pods. tcpdump zeigt mehrere NXDOMAIN-Queries vor der richtigen Antwort. Ursache und Mitigation?

## Options

- CoreDNS ist korrupt und antwortet verspätet
- Die TTL des Records ist null
- ndots:5-Expansion über die Search-Domains (FQDN mit Punkt nutzen)
- Zu wenig Bandbreite zwischen Nodes und CoreDNS

## Solution

**ndots:5-Expansion über die Search-Domains (FQDN mit Punkt nutzen)** ist die richtige Antwort: Mit `ndots:5` wird jeder Name mit weniger als 5 Punkten erst durch die Search-Domains expandiert — 3–5 zusätzliche (NXDOMAIN-)Queries pro Auflösung. Ein Punkt am Ende erzwingt die absolute Query; `dnsConfig.options ndots:1` ändert das Verhalten pro Pod.
