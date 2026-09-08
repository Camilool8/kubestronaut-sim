## Question

¿Cuál es la finalidad de NodeLocal DNSCache?

## Options

- Bloquear consultas externas
- Ejecutar una caché DNS en cada nodo
- Sustituir CoreDNS
- Servir únicamente registros PTR

## Solution

**Ejecutar una caché DNS en cada nodo** es la respuesta correcta: NodeLocal DNSCache (un DaemonSet) intercepta las consultas en el propio nodo mediante una IP link-local (por ejemplo, 169.254.20.10), responde desde la caché y utiliza TCP hacia CoreDNS, mitigando las clásicas condiciones de carrera de conntrack con DNS/UDP.
