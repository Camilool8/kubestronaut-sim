## Question

Para cifrar de forma transparente todo el tráfico pod-a-pod entre nodos, sin modificar las aplicaciones, ¿qué función del CNI habilita?

## Options

- kube-proxy en modo IPVS
- NetworkPolicy con un campo encrypt: true
- Cifrado WireGuard o IPsec en el CNI
- TLS en CoreDNS

## Solution

**Cifrado WireGuard o IPsec en el CNI** es la respuesta correcta: Cilium y Calico ofrecen cifrado transparente entre nodos mediante WireGuard (claves automáticas por nodo) o IPsec (rotación mediante secret). Cubre el tráfico en tránsito entre nodos y complementa el mTLS de aplicación.
