## Question

Pods auf demselben Node kommunizieren, Pods auf verschiedenen Nodes nicht. Das CNI nutzt VXLAN. Wahrscheinlichste Ursache?

## Options

- kube-scheduler ist falsch konfiguriert
- Der UDP-Port des VXLAN ist zwischen den Nodes blockiert
- Pods brauchen hostPort für Node-übergreifenden Traffic
- CoreDNS ist down

## Solution

**Der UDP-Port des VXLAN ist zwischen den Nodes blockiert** ist die richtige Antwort: Inter-Node-Traffic hängt an der Kapselung. Blockiert eine Firewall den VXLAN-UDP-Port (8472 bei Flannel/Cilium, 4789 IANA-Standard), bricht die Node-übergreifende Kommunikation. Prüfen mit `tcpdump -i any udp port 8472` und den Firewall-Regeln.
