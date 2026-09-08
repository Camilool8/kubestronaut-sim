## Question

Wird derselbe LoadBalancer-VIP per BGP von mehreren Nodes announct — welcher Router-Mechanismus verteilt den Traffic?

## Options

- ECMP (Equal-Cost Multi-Path)
- Reverse NAT am Edge-Router
- DNS-Round-Robin mit niedriger TTL
- STP (Spanning Tree Protocol) zwischen den Switches

## Solution

**ECMP (Equal-Cost Multi-Path)** ist die richtige Antwort: Mit ECMP installiert der Router mehrere gleichwertige Next-Hops und hasht pro Flow (5-Tupel) auf die announcenden Nodes — echtes Netzwerk-Balancing mit schneller Konvergenz, wenn ein Node aufhört zu announcen (BFD beschleunigt die Erkennung).
