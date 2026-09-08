## Question

Wie loggen Sie ALLE DNS-Queries, die CoreDNS empfängt, für temporäres Auditing/Debugging?

## Options

- Das log-Plugin in den Corefile-Block aufnehmen
- Permanentes tcpdump auf allen Nodes
- Audit am kube-apiserver aktivieren
- DNS-Logging ist nicht möglich

## Solution

**Das log-Plugin in den Corefile-Block aufnehmen** ist die richtige Antwort: Das `log`-Plugin druckt jede Query (Name, Typ, rcode, Dauer) nach stdout — lesen mit `kubectl logs -n kube-system -l k8s-app=kube-dns`. Wegen des Volumens temporär oder gescoped (`log example.com`) nutzen; für Dauer-Audit pro Pod: Hubble-DNS-Metriken/Flows.
