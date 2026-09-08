## Question

Wozu dient NodeLocal DNSCache?

## Options

- Externe Queries blockieren
- Ein DNS-Cache auf jedem Node
- CoreDNS ersetzen
- Nur PTR-Records ausliefern

## Solution

**Ein DNS-Cache auf jedem Node** ist die richtige Antwort: NodeLocal DNSCache (DaemonSet) fängt Queries auf dem Node selbst an einer Link-Local-IP ab (z. B. 169.254.20.10), antwortet aus dem Cache und geht per TCP zu CoreDNS — entschärft die klassischen Conntrack-Races mit DNS/UDP und senkt Latenz und CoreDNS-Last.
