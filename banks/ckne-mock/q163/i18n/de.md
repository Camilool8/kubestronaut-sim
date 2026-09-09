## Question

Apps melden unter Last sporadische DNS-Timeouts von EXAKT 5 Sekunden. Klassische Ursache und Mitigation?

## Options

- Ein defektes Netzwerkkabel an einem der Nodes
- CoreDNS ist unter jeder Last langsam
- TTL null in den vom Upstream gelieferten Records
- Conntrack-Race-Condition bei parallelen UDP-Queries

## Solution

**Conntrack-Race-Condition bei parallelen UDP-Queries** ist die richtige Antwort: Die "verfluchten 5 Sekunden": Drops durch eine Insertion-Race im Conntrack bei parallelen A+AAAA-Queries vom selben Socket; der Resolver wartet 5 s (Default) und wiederholt. Mitigation: NodeLocal DNSCache (nimmt NAT aus dem Pfad), single-request-reopen oder TCP erzwingen.
