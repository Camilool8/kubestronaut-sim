## Question

¿Cómo permite egress desde un pod únicamente hacia la subred 203.0.113.0/24, excepto al host 203.0.113.9?

## Options

- Añadir el host a /etc/hosts como blackhole
- ipBlock no admite excepciones
- Dos policies separadas: una allow y otra deny
- ipBlock con cidr 203.0.113.0/24 y except 203.0.113.9/32

## Solution

**ipBlock con cidr 203.0.113.0/24 y except 203.0.113.9/32** es la respuesta correcta: `ipBlock` acepta un `cidr` y una lista `except`. Recuerde que al existir cualquier policy de egress, todo lo demás queda bloqueado, incluido DNS; permita también el puerto 53 hacia kube-dns.
