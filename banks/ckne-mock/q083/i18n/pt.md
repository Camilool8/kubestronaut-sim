## Question

Qual é o papel do GatewayClass no Gateway API?

## Options

- Definir a implementação/controlador que materializa os Gateways
- Agrupar HTTPRoutes por versão
- Definir certificados TLS
- Substituir o IngressClass obrigatoriamente em todo cluster

## Solution

**Definir a implementação/controlador que materializa os Gateways** é a resposta correta: O `GatewayClass` (cluster-scoped) diz QUEM implementa: `controllerName` aponta o controlador (ex.: istio.io/gateway-controller, gateway.envoyproxy.io/...). Um cluster pode ter várias classes (interno, externo, mesh) e cada Gateway referencia uma.
