## Question

¿Cuál es la función de GatewayClass en Gateway API?

## Options

- Definir la implementación/controlador que materializa los Gateways
- Agrupar HTTPRoutes por versión
- Definir certificados TLS
- Sustituir obligatoriamente IngressClass en todo el cluster

## Solution

**Definir la implementación/controlador que materializa los Gateways** es la respuesta correcta: `GatewayClass` (con alcance de cluster) indica QUIÉN implementa: `controllerName` apunta al controlador (por ejemplo, istio.io/gateway-controller, gateway.envoyproxy.io/...). Un cluster puede tener varias clases (interna, externa, mesh) y cada Gateway referencia una.
