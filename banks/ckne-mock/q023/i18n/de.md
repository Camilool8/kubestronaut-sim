## Question

Was bewirkt externalTrafficPolicy: Local bei einem LoadBalancer/NodePort-Service?

## Options

- Leitet nur an node-lokale Endpoints weiter und erhält die Client-IP
- Beschränkt den Zugriff auf Clients im selben Subnetz
- Erzwingt den IPVS-Modus
- Deaktiviert das Balancing und schickt alles an den ersten Endpoint

## Solution

**Leitet nur an node-lokale Endpoints weiter und erhält die Client-IP** ist die richtige Antwort: Mit `Local` leitet ein Node nur an lokale Pods — kein SNAT, die echte Client-IP bleibt erhalten. Nodes ohne Endpoints fallen per healthCheckNodePort aus dem LB. Mit `Cluster` (Standard) gibt es ggf. einen zweiten Hop mit SNAT.
