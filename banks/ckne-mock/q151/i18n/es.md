## Question

Dos clusters con pod CIDR IDÉNTICOS (ambos 10.244.0.0/16) deben conectarse mediante Submariner. ¿Es posible?

## Options

- Solo si uno de los clusters utiliza IPv6
- No, los CIDR superpuestos impiden cualquier conexión
- Sí, con Globalnet: CIDR virtuales + NAT entre clusters
- Sí, sin ninguna configuración adicional

## Solution

**Sí, con Globalnet: CIDR virtuales + NAT entre clusters** es la respuesta correcta: Los CIDR superpuestos impiden el enrutamiento directo, porque ambos lados ven la misma red. Submariner Globalnet crea globalCIDR virtuales más NAT de ingress/egress: la solución específica para entornos brownfield con rangos repetidos.
