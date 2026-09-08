## Question

En bare metal, creó el Gateway y permanece con ADDRESS vacío y Programmed: False indefinidamente. Los HTTPRoutes son correctos. ¿Qué falta?

## Options

- Añadir al Gateway una annotation con la static-ip del nodo master
- HTTPRoute debe crearse antes que Gateway
- Falta un proveedor de VIP (LB-IPAM/MetalLB) para la dirección
- Reiniciar apiserver

## Solution

**Falta un proveedor de VIP (LB-IPAM/MetalLB) para la dirección** es la respuesta correcta: Es la misma causa que el clásico "LoadBalancer pending": la implementación del Gateway solicita una dirección y en bare metal nadie responde. LB-IPAM/MetalLB asigna la IP; L2 o BGP la anuncia.
