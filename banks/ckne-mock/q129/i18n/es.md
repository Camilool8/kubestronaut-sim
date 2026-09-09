## Question

Hace ping al ClusterIP de un Service y no recibe respuesta, pero curl al puerto del Service funciona perfectamente. ¿Por qué?

## Options

- ICMP requiere NodePort
- El Service está roto y curl utiliza una caché
- Los VIP son reglas DNAT, sin una interfaz que responda ICMP
- El firewall bloquea curl

## Solution

**Los VIP son reglas DNAT, sin una interfaz que responda ICMP** es la respuesta correcta: Trampa de troubleshooting: el VIP no está asignado a ninguna interfaz; iptables/IPVS/eBPF solo traducen `VIP:port`. Pruebe los Services con `nc -zv`/`curl`, nunca con ping.
