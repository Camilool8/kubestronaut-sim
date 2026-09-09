## Question

Welcher Befehl zeigt die Connection-Tracking-Einträge (NAT/State), um zu prüfen, wo die Verbindung eines Pods übersetzt wird?

## Options

- free -m
- lsof -i
- systemctl status conntrack
- conntrack -L | grep `<pod-IP>`

## Solution

**conntrack -L | grep `<pod-IP>`** ist die richtige Antwort: `conntrack -L` listet die Kernel-Conntrack-Tabelle: Man sieht das Original-Tupel (Pod→ClusterIP) und das übersetzte (Pod→Endpoint) nach dem DNAT des kube-proxy — essenziell, um das Service-NAT zu bestätigen.
