## Question

Die App meldet hohe Latenz zwischen zwei Services. node_netstat_Tcp_RetransSegs wächst auf den beteiligten Nodes schnell. Was heißt das?

## Options

- Paketverlust auf dem Pfad
- DNS ist langsam
- etcd braucht Kompaktierung
- Dem Deployment fehlen Replikas

## Solution

**Paketverlust auf dem Pfad** ist die richtige Antwort: TCP-Retransmissions = Paketverlust (MTU/Fragmentierung, volle Queues, schlechter Link). Häufiger Täter: falsche MTU mit Overlay (VXLAN kostet ~50 Bytes). Mit `ping -M do -s 1472`, `tcpdump` und der CNI-MTU validieren.
