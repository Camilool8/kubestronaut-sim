## Question

Sie brauchen eine Bandbreiten- und Latenz-Baseline Pod-zu-Pod zwischen zwei bestimmten Nodes, bevor Sie das Netz für App-Langsamkeit verantwortlich machen. Direkte Methode?

## Options

- kubectl top nodes im Spitzenzeitraum
- Service-Replikas erhöhen und die Graphen beobachten
- iperf3 zwischen Pods beider Nodes, verglichen mit dem Same-Node-Fall
- Die Kapazitätsdokumentation des Rechenzentrums lesen

## Solution

**iperf3 zwischen Pods beider Nodes, verglichen mit dem Same-Node-Fall** ist die richtige Antwort: Ohne Baseline ist jede Debatte Meinung. Das iperf3-Paar misst die reale Obergrenze des Datapaths (inkl. Kapselungs-/Verschlüsselungs-Overhead); der Vergleich Same-Node vs. Cross-Node isoliert, wo die Degradierung wohnt. Latenz/Verlust: mtr/ping.
