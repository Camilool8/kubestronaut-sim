## Question

Was sind Submariners Hauptkomponenten zum Verbinden von Clustern?

## Options

- Broker, Gateway-Nodes und Lighthouse
- Hub, Spoke und Wheel
- Master, Worker und Etcd
- Ingress, Egress und Midgress

## Solution

**Broker, Gateway-Nodes und Lighthouse** ist die richtige Antwort: Der Broker (in einem oder dediziertem Cluster) synct die Endpoints; Gateway-Nodes bauen verschlüsselte Tunnel (IPsec/WireGuard) zwischen den Clustern (auch bei überlappenden CIDRs, via Globalnet); Lighthouse löst `clusterset.local` auf und implementiert die MCS API.
