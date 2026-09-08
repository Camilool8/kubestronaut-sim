## Question

Beim Neustart des BGP-Agents (Cilium/Calico-Upgrade) fiel der Traffic der announcten VIPs ~30 s aus, bis die Session wieder stand. Welche zwei Mechanismen reduzieren das?

## Options

- BGP immer gegen L2 tauschen
- Graceful Restart (hält Routen beim Restart) und BFD (ms-Erkennung)
- Mehr CoreDNS- und kube-apiserver-Replikas während des Upgrades
- Die Tunnel-MTU zwischen den Nodes senken

## Solution

**Graceful Restart (hält Routen beim Restart) und BFD (ms-Erkennung)** ist die richtige Antwort: Graceful Restart unterscheidet "geplanter Restart" von "toter Node" und erhält das Forwarding; BFD beschleunigt die Erkennung, wenn der Node WIRKLICH stirbt (Failover auf andere ECMP-Nodes). Zusammen: Upgrades ohne Blackholes, Failover unter einer Sekunde.
