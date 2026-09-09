## Question

Nach Bündelung allen Egress auf eine einzige egressIP scheitern externe Verbindungen in Spitzen sporadisch mit "cannot assign requested address" am Gateway. Welches Limit wurde erreicht?

## Options

- DNS-Limit
- Das Bandbreitenlimit des Kernels auf dem Gateway-Node
- Pods-pro-Node-Limit
- Erschöpfung der SNAT-Quellports

## Solution

**Erschöpfung der SNAT-Quellports** ist die richtige Antwort: SNAT multiplext alles in (egressIP, Port): Das Tupel (proto, srcIP, srcPort, dst) muss eindeutig sein. Eine IP hat ~64k ephemere Ports — bei Skalierung: Port Exhaustion. Mitigation: mehrere egressIPs, Connection-Reuse, kürzere Timeouts.
