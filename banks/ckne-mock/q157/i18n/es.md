## Question

Una policy de INGRESS permite tráfico hacia el pod en el puerto 8080, pero NO existe ninguna policy de egress que permita las respuestas. ¿Funcionan las conexiones?

## Options

- Solo durante 30 segundos
- No, la respuesta debe permitirse en egress
- Sí: la aplicación es stateful
- Solo con UDP

## Solution

**Sí: la aplicación es stateful** es la respuesta correcta: Las NetworkPolicies operan sobre conexiones mediante conntrack, no paquete por paquete: permitir la dirección iniciadora es suficiente. Confundir esto con ACL stateless conduce a policies de "respuesta" redundantes y engañosas.
