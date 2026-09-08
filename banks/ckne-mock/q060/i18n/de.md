## Question

Was erwarten Sie bei einem CNI im nativen Routing-Modus (ohne Kapselung) in `ip route` auf dem Node?

## Options

- Routen zu den podCIDRs der anderen Nodes via IP des Nachbar-Nodes
- /32-Routen für jeden Pod des gesamten Clusters
- Keine Pod-bezogenen Routen
- Nur die Default-Route Richtung physischem Gateway

## Solution

**Routen zu den podCIDRs der anderen Nodes via IP des Nachbar-Nodes** ist die richtige Antwort: Im Direct-/Native-Routing wird nicht gekapselt: Jeder Node muss wissen, dass das podCIDR des Nachbarn über dessen IP erreichbar ist (z. B. 10.244.2.0/24 via 192.168.1.12). Diese Routen installiert das CNI oder BGP. Fehlen sie, bricht der Node-übergreifende Traffic.
