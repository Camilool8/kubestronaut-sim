## Question

Para exponer directamente las redes de pods a la red física de la empresa, sin NAT y haciendo que las IP de los pods sean enrutables, ¿qué enfoque se utiliza?

## Options

- Crear un NodePort por pod
- Anunciar los pod CIDR mediante BGP
- Habilitar hostNetwork en todos los pods
- Aumentar ndots en resolv.conf

## Solution

**Anunciar los pod CIDR mediante BGP** es la respuesta correcta: Los CNI compatibles con BGP establecen sesiones con los routers y anuncian los podCIDR de cada nodo. La red externa aprende las rutas y alcanza directamente a los pods, eliminando encapsulación/NAT.
