## Question

Was ist der Hauptvorteil des IPVS-Modus von kube-proxy gegenüber dem iptables-Modus?

## Options

- Native L7-(HTTP)-Balancing-Unterstützung mit Header-Inspektion
- O(1)-Komplexität beim Forwarding und Balancing-Algorithmen
- Braucht das conntrack-Modul nicht
- Verschlüsselt den Pod-zu-Pod-Traffic

## Solution

**O(1)-Komplexität beim Forwarding und Balancing-Algorithmen** ist die richtige Antwort: Im iptables-Modus wachsen die Regeln mit der Service-Zahl und werden sequenziell ausgewertet. IPVS nutzt Kernel-Hashtabellen (~O(1)-Lookup) und bietet round-robin, least-connections, source-hash. Beide bleiben L4.
