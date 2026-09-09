## Question

Después de migrar Calico de VXLAN a IPIP, el tráfico de pods entre nodos dejó de funcionar SOLO en el entorno cloud. ¿Cuál es la causa probable?

## Options

- IPIP utiliza el protocolo IP 4 (no TCP/UDP), a menudo bloqueado por security groups/firewalls del cloud que solo permiten TCP/UDP/ICMP
- La MTU aumentó por sí sola
- IPIP ya no existe
- kube-proxy no funciona con IPIP

## Solution

**IPIP utiliza el protocolo IP 4 (no TCP/UDP), a menudo bloqueado por security groups/firewalls del cloud que solo permiten TCP/UDP/ICMP** es la respuesta correcta: La encapsulación IPIP no utiliza puertos; es el protocolo IP número 4. Los security groups que filtran por TCP/UDP pueden descartarlo silenciosamente. VXLAN (UDP 4789/8472) suele pasar. Permita el protocolo 4 o vuelva a VXLAN.
