## Question

¿Cuáles son dos limitaciones reales de las NetworkPolicies nativas de Kubernetes?

## Options

- No pueden filtrar por hostname/L7
- Solo se aplican al namespace kube-system
- Requieren reiniciar los pods en cada cambio
- No funcionan con TCP

## Solution

**No pueden filtrar por hostname/L7** es la respuesta correcta: La API nativa es L3/L4: no admite reglas por FQDN, métodos HTTP, deny explícito, prioridad ni logging. Los CNI la amplían: `toFQDNs` y reglas HTTP en Cilium, `action: Deny/Log` en Calico. Las policies se aplican sin reiniciar los pods.
