## Question

¿Cuál es la principal limitación del modo L2 (ARP) para anunciar LoadBalancer (MetalLB L2 / Cilium L2 Announcements)?

## Options

- Requiere una licencia comercial MetalLB Enterprise
- Todo el tráfico de un VIP entra a través de UN único nodo elegido
- No admite TCP, solo UDP
- No funciona con IPv4, solo con IPv6 dual-stack

## Solution

**Todo el tráfico de un VIP entra a través de UN único nodo elegido** es la respuesta correcta: En L2, un único nodo responde ARP por el VIP: el ancho de banda de entrada queda limitado a ese nodo y el failover depende de gratuitous ARP, con segundos de indisponibilidad. BGP+ECMP resuelve ambos problemas y por eso suele preferirse en producción.
