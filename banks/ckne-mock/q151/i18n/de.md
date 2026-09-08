## Question

Zwei Cluster mit IDENTISCHEN Pod-CIDRs (beide 10.244.0.0/16) sollen per Submariner verbunden werden. Möglich?

## Options

- Nur wenn ein Cluster IPv6 ist
- Nein, überlappende CIDRs verhindern jede Verbindung
- Ja, mit Globalnet: virtuelle CIDRs + Cross-Cluster-NAT
- Ja, ganz ohne Konfiguration

## Solution

**Ja, mit Globalnet: virtuelle CIDRs + Cross-Cluster-NAT** ist die richtige Antwort: Überlappende CIDRs verhindern direktes Routing (gleiches Netz auf beiden Seiten). Submariner Globalnet erzeugt virtuelle globalCIDRs + Ingress-/Egress-NAT — die spezifische Lösung für Brownfields mit wiederholten Bereichen.
