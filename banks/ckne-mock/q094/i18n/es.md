## Question

En Cilium Cluster Mesh, ¿cómo hace que un Service esté disponible y balanceado en todos los clusters conectados?

## Options

- Mismo nombre/namespace + la annotation service.cilium.io/global
- Exponer mediante NodePort en todos los nodos
- Copiar manualmente el ClusterIP
- Solo mediante un Ingress compartido entre los clusters

## Solution

**Mismo nombre/namespace + la annotation service.cilium.io/global** es la respuesta correcta: Con la annotation global, Cilium combina los backends de todos los clusters en el balanceo. Adicionalmente, `service.cilium.io/affinity: local` prefiere endpoints del cluster local y realiza failover automático hacia endpoints remotos si los locales dejan de estar disponibles.
