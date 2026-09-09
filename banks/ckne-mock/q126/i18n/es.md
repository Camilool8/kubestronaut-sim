## Question

Un pod fue configurado con dnsPolicy: Default. ¿Cuál es el comportamiento y por qué el nombre resulta engañoso?

## Options

- Utiliza un 8.8.8.8 fijo
- Deshabilita DNS por completo
- Hereda el resolv.conf del NODO
- Utiliza el DNS del cluster, como sugiere el nombre

## Solution

**Hereda el resolv.conf del NODO** es la respuesta correcta: Trampa clásica de nomenclatura: `Default` significa "heredar del nodo", lo que rompe la resolución de Services. La policy que realmente se aplica de forma predeterminada a los pods es `ClusterFirst`.
