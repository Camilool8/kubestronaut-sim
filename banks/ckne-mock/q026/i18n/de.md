## Question

Aller Egress-Traffic des Clusters zu einer externen API muss von einer festen IP kommen (Firewall-Allow-List). Welche Lösung?

## Options

- Das Pod-CIDR vergrößern
- hostPort an den Pods verwenden
- Den Service auf ExternalName umstellen
- Ein Egress Gateway konfigurieren

## Solution

**Ein Egress Gateway konfigurieren** ist die richtige Antwort: Egress-Gateways bündeln Egress auf bestimmte Nodes/IPs: In Cilium SNATet eine `CiliumEgressGatewayPolicy` auf die egressIP eines Gateway-Nodes; in Istio verlässt der Traffic das Mesh über das Egress-Gateway. Sonst ist die Egress-IP die des jeweiligen Nodes.
