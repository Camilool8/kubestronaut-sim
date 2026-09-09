## Question

Was ist die Hauptlimitierung des L2-(ARP-)Modus beim LoadBalancer-Announcement (MetalLB L2 / Cilium L2 Announcements)?

## Options

- Erfordert eine kommerzielle MetalLB-Enterprise-Lizenz
- Der gesamte Traffic eines VIP läuft über EINEN gewählten Node
- Unterstützt kein TCP, nur UDP
- Funktioniert nicht mit IPv4, nur mit Dual-Stack-IPv6

## Solution

**Der gesamte Traffic eines VIP läuft über EINEN gewählten Node** ist die richtige Antwort: Im L2-Modus beantwortet ein einziger Node ARP für den VIP: Die Eingangsbandbreite ist auf diesen Node begrenzt und das Failover hängt an Gratuitous ARP (Sekunden Ausfall). BGP+ECMP löst beides — daher der bevorzugte Produktionsmodus.
