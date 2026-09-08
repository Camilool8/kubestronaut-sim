## Question

Welche Rolle spielt die GatewayClass in der Gateway API?

## Options

- Definiert die Implementierung/den Controller, der Gateways materialisiert
- Gruppiert HTTPRoutes nach Version
- Definiert TLS-Zertifikate
- Ersetzt zwingend die IngressClass im Cluster

## Solution

**Definiert die Implementierung/den Controller, der Gateways materialisiert** ist die richtige Antwort: `GatewayClass` (cluster-scoped) sagt WER implementiert: `controllerName` zeigt auf den Controller (istio.io/gateway-controller, gateway.envoyproxy.io/…). Ein Cluster kann mehrere Klassen haben (intern, extern, Mesh); jedes Gateway referenziert eine — analog zur StorageClass.
