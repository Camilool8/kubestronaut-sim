## Question

Quelle est la principale limite du mode L2 (ARP) d'annonce de LoadBalancer (MetalLB L2 / Cilium L2 Announcements) ?

## Options

- Exige une licence commerciale MetalLB Enterprise
- Tout le trafic d'un VIP entre par UN seul nœud élu
- Ne supporte pas TCP, seulement UDP
- Ne fonctionne pas avec IPv4, seulement IPv6 dual-stack

## Solution

**Tout le trafic d'un VIP entre par UN seul nœud élu** est la bonne réponse : En L2, un seul nœud répond à l'ARP du VIP : la bande passante entrante est limitée à ce nœud et le failover dépend du gratuitous ARP (secondes d'indisponibilité). BGP+ECMP résout les deux — d'où le mode préféré en production.
