## Question

¿Qué tipo de Service proporciona un VIP interno del cluster con balanceo L4 (TCP/UDP/SCTP), sin exposición externa?

## Options

- NodePort
- ClusterIP
- ExternalName
- LoadBalancer

## Solution

**ClusterIP** es la respuesta correcta: `ClusterIP` es el tipo predeterminado: una IP virtual estable, resoluble mediante DNS interno, con balanceo L4 hacia los endpoints. NodePort abre un puerto en cada nodo; LoadBalancer aprovisiona un LB externo; ExternalName es únicamente un CNAME.
