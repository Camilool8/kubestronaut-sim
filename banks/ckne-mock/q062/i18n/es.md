## Question

Al utilizar VXLAN con interfaces de nodo de MTU 1500, ¿qué configuración evita la fragmentación o pérdida de paquetes grandes?

## Options

- La MTU del CNI descontando el overhead del túnel (por ejemplo, 1450)
- Reducir el número de réplicas
- Aumentar la MTU de los pods a 9000
- Deshabilitar TCP y utilizar solo UDP en los pods

## Solution

**La MTU del CNI descontando el overhead del túnel (por ejemplo, 1450)** es la respuesta correcta: El header VXLAN consume unos 50 bytes; si el pod envía frames de 1500 bytes, el paquete encapsulado supera la MTU física y se descarta. Configure la MTU del CNI (campo `mtu`/autodetección) en 1450 o habilite jumbo frames (9000) en la red física.
