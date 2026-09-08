## Question

Endpoints korrekt, Pod-zu-Pod per IP klappt, aber ClusterIP-Zugriff scheitert von allen Pods EINES bestimmten Nodes. Hauptverdächtiger?

## Options

- CoreDNS ist auf allen Replikas ausgefallen
- Der kube-proxy dieses Nodes ist down oder hat die Regeln nicht programmiert
- Der Namespace wird im Hintergrund gelöscht
- Das Container-Image ist falsch

## Solution

**Der kube-proxy dieses Nodes ist down oder hat die Regeln nicht programmiert** ist die richtige Antwort: ClusterIP wird PRO NODE materialisiert (iptables/IPVS/eBPF). Erreicht ein einzelner Node keine VIPs, ist die lokale Programmierung defekt: kube-proxy crasht, Regeln nicht synchronisiert oder lokale Firewall. `iptables-save | grep <svc>` zwischen Nodes vergleichen.
